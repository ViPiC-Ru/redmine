/* 0.2.3 взаимодействие с redmine по средствам api

cscript redmine.min.js <instance> <method> [... <param>]
cscript redmine.min.js <instance> users.sync <source> <fields> [<auth>]
cscript redmine.min.js <instance> issues.sync <destination> <query> [<filters>] <fields>
cscript redmine.min.js <instance> issues.change [<query>] [<filters>] <fields>

<instance>              - Адрес для подключения к Redmine в формате url (с указанием логина, пароля или ключа во фрагменте).
<method>                - Собственный метод, который нужно выполнить.
    users.sync          - Синхранизация пользователей из источника данных.
        <source>        - Адрес для подключения к Active Directory в формате url (поддерживается протокол ldap).
        <fields>        - Поля и их значения в источнике в формате ID:value;id:value с шаблонизацией.
        <auth>          - Идентификатор режима аутентификации в Redmine.
    issues.sync         - Синхранизация задач в приёмник данных.
        <destination>   - Адрес для подключения к Cherwell в формате url (с указанием логина, пароля или клиента во фрагменте).
        <query>         - Идентификатор сохранённого запроса для всех проектов в Redmine и Cherwell.
        <filters>       - Фильтр в формате id:value,value;id:value,value с шаблонизацией.
        <fields>        - Поля и их значения в формате id:value;id:value с шаблонизацией.
    issues.change       - Изменение задач в Redmine.
        <query>         - Идентификатор сохранённого запроса для всех проектов.
        <filters>       - Фильтр в формате id:value,value;id:value,value с шаблонизацией.
        <fields>        - Поля и их значения в формате id:value;id:value с шаблонизацией.

*/

var readmine = new App({
    apiReadmineUrl: null,           // базовый url для запросов к api readmine
    apiReadmineKey: null,           // ключ доступа к api readmine
    apiReadmineUser: null,          // логин для доступа к api readmine
    apiReadminePassword: null,      // пароль для доступа к api readmine
    apiCherwellUrl: null,           // базовый url для запросов к api cherwell
    apiCherwellClient: null,        // идентификатор клиента для доступа к api cherwell
    apiCherwellUser: null,          // логин для доступа к api cherwell
    apiCherwellPassword: null,      // пароль для доступа к api cherwell
    apiCherwellToken: null,         // токен для взаимодействия с api cherwell
    apiADPath: null,                // базовый путь для запросов к active directory
    userActive: 1,                  // статус активного пользователя
    userRegistered: 2,              // статус зарегистрированного пользователя
    userLocked: 3,                  // статус заблокированного пользователя
    delimVal: ":",                  // разделитель значения от ключа
    delimKey: ";",                  // разделитель ключей между собой
    delimParam: ",",                // разделитель параметров между собой
    delimMap: "=",                  // разделитель соответствия
    delimId: "."                    // разделитель идентификаторов в ключе
});

// подключаем зависимые свойства приложения
(function (app, wsh, undefined) {// замыкаем чтобы не засорять глабальные объекты
    app.lib.extend(app, {// добавляем частный функционал приложения
        fun: {// зависимые функции частного назначения

            /**
             * Преобразовывает строку в значение угадывая тип.
             * @param {string} input - Строка с данными.
             * @returns {string|boolean|number|date} Значение данных.
             */

            str2val: function (input) {
                var value;

                switch (true) {// поддерживаемые преобразования
                    case "true" == input: value = true; break;
                    case "false" == input: value = false; break;
                    case !!input && !isNaN(input): value = Number(input); break;
                    case "--" == input.charAt(4) + input.charAt(7) &&
                        "::" == input.charAt(13) + input.charAt(16) &&
                        "TZ" == input.charAt(10) + input.charAt(19):
                        value = Date.UTC(// дата в нужном часовом поясе
                            Number(input.substr(0, 4)),
                            Number(input.substr(5, 2)),
                            Number(input.substr(8, 2)),
                            Number(input.substr(11, 2)),
                            Number(input.substr(14, 2)),
                            Number(input.substr(17, 2))
                        );
                        value = new Date(value);
                        break;
                    default: value = input;
                };
                // возвращаем результат
                return value;
            },

            /**
             * Преобразовывает значение в строку.
             * @param {string|boolean|number|date} input - Значение данных.
             * @returns {string|null} Строка с данными или null.
             */

            val2str: function (input) {
                var value;

                switch (true) {// поддерживаемые преобразования
                    case app.lib.validate(input, "string"):
                    case app.lib.validate(input, "number"):
                        value = "" + input;
                        break;
                    case app.lib.validate(input, "boolean"):
                        value = input ? "true" : "false";
                        break;
                    case app.lib.validate(input, "date"):
                        value = input.getUTCFullYear()
                            + "-" + app.lib.strPad(input.getUTCMonth(), 2, "0", "left")
                            + "-" + app.lib.strPad(input.getUTCDate(), 2, "0", "left")
                            + "T" + app.lib.strPad(input.getUTCHours(), 2, "0", "left")
                            + ":" + app.lib.strPad(input.getUTCMinutes(), 2, "0", "left")
                            + ":" + app.lib.strPad(input.getUTCSeconds(), 2, "0", "left")
                            + "Z";
                        break;
                    default:
                        value = null;
                };
                // возвращаем результат
                return value;
            },

            /**
             * Рекурсивно конвертирует XML в объект с данными.
             * @param {XMLDocument} [xml] - Объект XML для конвертации.
             * @returns {object|array|null} Сконвертированный объект с данными.
             */

            xml2obj: function (xml) {
                var node, item, value, obj = {}, isArray = null, isNull = true;

                // обрабатываем xml
                if (xml) {// если передан xml для работы
                    // обрабатываем аттрибуты и переносим их значения в объект
                    node = xml.documentElement ? xml.documentElement : xml;
                    for (var i = 0, iLen = node.attributes.length; i < iLen; i++) {
                        item = node.attributes[i];// получаем очередное значение
                        isNull = false;// отмечаем что объект не пустой элимент
                        if ("type" != item.name && "array" != item.value) {// если не массив
                            obj[item.name] = app.fun.str2val(item.value);// переносим значения
                        } else if (!xml.documentElement) isArray = true;
                    };
                    // обрабатываем дочерние элименты и переносим их значения в объект
                    if (isArray) obj = [];// переключаемся в режим массива
                    for (var i = 0, iLen = xml.childNodes.length; i < iLen; i++) {
                        node = xml.childNodes[i];// получаем очередное значение
                        switch (node.nodeType) {// поддерживаемые типы узлов
                            case 1: // узел элемента
                                isNull = false;// отмечаем что объект не пустой
                                value = app.fun.xml2obj(node);
                                if (isArray) obj.push(value);
                                else obj[node.nodeName] = value;
                                break;
                            case 3:// текстовый узел
                                isNull = false;// отмечаем что объект не пустой
                                obj = app.fun.str2val(node.nodeValue);
                                break;
                        };
                    };
                } else isNull = false;
                // возвращаем результат
                return !isNull ? obj : null;
            },

            /**
             * Рекурсивно конвертирует объект с данными в XML.
             * @param {object|array} [obj] - Объект с данными для конвертации.
             * @param {Element} [parent] - Родительские элимент.
             * @returns {XMLDocument|DocumentFragment|null} Сконвертированные данные в XML.
             */

            obj2xml: function (obj, parent) {
                var value, unit, node, item, items, names, name = "item",
                    xml = null, fragment = null;

                // создаём необходимые объекты
                names = {// преобразование имён
                    custom_fields: "custom_field",
                    memberships: "membership",
                    groups: "group",
                    issues: "issue",
                    users: "user",
                    roles: "role"
                };
                // определяем document для xml
                if (!parent) {// если не передан родитель
                    items = [// список идентификаторов объектов
                        "MSXML2.DOMDocument.6.0",
                        "MSXML2.DOMDocument.3.0",
                        "MSXML2.DOMDocument"
                    ];
                    for (var i = 0, iLen = items.length; !xml && i < iLen; i++) {
                        item = items[i];// получаем очередной элимент
                        try {// пробуем сформировать объект
                            xml = new ActiveXObject(item);
                        } catch (e) { };// игнорируем исключения
                    };
                    value = 'version="1.0" encoding="UTF-8"';
                    node = xml.createProcessingInstruction("xml", value);
                    xml.appendChild(node);// добавляем заголовки
                } else if (parent.ownerDocument) {// если не document
                    xml = parent.ownerDocument;
                };
                // работаем с переданными данными
                if (xml) {// если удалось создать xml
                    fragment = xml.createDocumentFragment();
                    // обрабатываем данные переданные в виде массива
                    if (app.lib.validate(obj, "array")) {// если нужно выполнить
                        if (parent) {// если задан родитель
                            parent.setAttribute("type", "array");
                            value = parent.nodeName;// получаем имя узла
                            name = names[value] ? names[value] : name;
                        };
                        // работаем с массивом элиментов
                        for (var i = 0, iLen = obj.length; i < iLen; i++) {
                            unit = xml.createElement(name);// создаём узел
                            // работаем с элиментом массива
                            for (var key in obj[i]) {// пробизаемся по ключам
                                item = obj[i][key];// получаем очередной элимент
                                value = app.fun.val2str(item);// конвертируем в значение
                                switch (true) {// условные преобразования
                                    case "value" == key && "custom_field" == name:// значение поля
                                    case "membership" == name:// участник
                                    case "user" == name:// участник
                                        node = item;// сохраняем элимент
                                        item = {};// сбрасываем значение
                                        item[key] = node;// назначаем
                                    case !value:// в элименте не значение
                                        node = app.fun.obj2xml(item, unit);
                                        unit.appendChild(node);
                                        break;
                                    default:// по умолчанию
                                        unit.setAttribute(key, value);
                                };
                            };
                            fragment.appendChild(unit);
                        };
                    };
                    // обрабатываем данные переданные в виде объекта
                    if (app.lib.validate(obj, "object")) {// если нужно выполнить
                        if (parent) name = parent.nodeName;// имя родителя
                        // работаем с переданным объектом
                        for (var key in obj) {// пробизаемся по ключам
                            item = obj[key];// получаем очередной элимент
                            value = app.fun.val2str(item);// конвертируем в значение
                            switch (true) {// условные преобразования
                                case !!value && "project" == name:// проект
                                case !!value && "tracker" == name:// трекер
                                case !!value && "priority" == name:// приоритет
                                case !!value && "author" == name:// автор
                                case !!value && "category" == name:// категория
                                    if (parent) parent.setAttribute(key, value);
                                    break;
                                case !!parent || !unit && !value:// нужно выполнить
                                    unit = xml.createElement(key);
                                    if (!value) node = app.fun.obj2xml(item, unit);
                                    else node = xml.createTextNode(value);
                                    unit.appendChild(node);
                                    fragment.appendChild(unit);
                            };

                        };
                        // работаем с аттрибутами корневого элимента
                        if (!parent && unit) {// если это свойство корня
                            for (var key in obj) {// пробизаемся по ключам
                                item = obj[key];// получаем очередной элимент
                                value = app.fun.val2str(item);// конвертируем в значение
                                if (value) unit.setAttribute(key, value);
                            };
                        };
                    };
                    // возвращаем результат
                    if (!parent) xml.appendChild(fragment);
                };
                return parent ? fragment : xml;
            },

            /**
             * Преобразует элимент ldap в объект пользователя.
             * @param {object} item - Элимент с данными для конвертации.
             * @param {object} fields - Объект соответствия id поля и шаблона.
             * @returns {object} Объект пользователя.
             */

            item2user: function (item, fields) {
                var value, flag, user = {}, error = 0;

                // проверяем наличее элимента с данными
                if (!error) {// если нету ошибок
                    if (item) {// если элимент передан
                    } else error = 1;
                };
                // проверяем наличее объект соответствия
                if (!error) {// если нету ошибок
                    if (fields) {// если объект передан
                    } else error = 2;
                };
                // вычесляем статус и кешируем пользователя
                if (!error) {// если нету ошибок
                    value = item.get("userAccountControl");
                    flag = value & 2;// пользователь заблокирован
                    user.status = !flag ? app.val.userActive : app.val.userLocked;
                };
                // получаем значение для полей
                if (!error) {// если нету ошибок
                    for (var id in fields) {// пробигаемся по соответствию
                        value = fields[id];// получаем очередное значение
                        if (value) {// если в фильтре есть шаблон
                            value = app.lib.template(value, function (keys) {
                                var unit, flag, key;

                                // последовательно получаем данные по ключам
                                flag = true;// успешность получения данных
                                unit = item;// получаем объект для запросов
                                for (var i = 0, iLen = keys.length; flag && i < iLen; i++) {
                                    key = keys[i];// получаем очередной ключ
                                    try {// пробуем получить значение по ключу
                                        if (i) unit = app.wsh.ldap(unit)[0];
                                        if (unit) unit = unit.get(key);
                                        else flag = false;
                                    } catch (e) {// обрабатываем исключения
                                        flag = false;
                                    };
                                };
                                // возвращаем результат
                                if (flag) return unit;
                            }, app.fun.filter);
                        };
                        // присваиваем значения
                        value = app.fun.str2val(value);
                        if (!isNaN(id)) {// если дополнительное поле
                            if (!user.custom_fields) user.custom_fields = [];
                            user.custom_fields.push({ id: id, value: value });
                        } else user[id] = value;
                    };
                };
                // возвращаем результат
                return user;
            },

            /**
             * Получает аттрибут по по значению заданного типа.
             * @param {string} type - Тип получаемого аттрибута.
             * @param {string} value - Значение для получаемого аттрибута.
             * @returns {string} Запрошенный аттрибут или пустая строка.
             */

            getAttribute: function (type, value) {
                var map, attribute = "";

                // создаём необходимые объекты
                map = {// связь идетификаторов
                    "project.id": ["project_id"],
                    "tracker.id": ["tracker_id"],
                    "status.id": ["status_id"],
                    "priority.id": ["priority_id"],
                    "author.id": ["author_id"],
                    "assigned_to.id": ["assigned_to_id"],
                    "category.id": ["category_id"],
                    "fixed_version.id": ["fixed_version_id"],
                    "parent.id": ["parent_issue_id"]
                };
                // вычисляем аттрибут
                switch (type) {// поддерживаемые типы
                    case "custom":// пользовательский
                        for (var key in map) {// пробигаемся по связям
                            for (var i = 0, iLen = map[key].length; i < iLen; i++) {
                                if (value == map[key][i]) attribute = key;
                            };
                        };
                        break;
                    case "original":// оригинальный
                        for (var key in map) {// пробигаемся по связям
                            if (value == key) attribute = map[key][0];
                        };
                        break;
                };
                // возвращаем результат
                return attribute;
            },

            /**
             * Фильтрует переданные данные.
             * @param {string} name - Имя фильтра для фильтрации.
             * @param {object} data - Данные для фильтрации.
             * @returns {object|undefined} Отфильтрованные данные.
             */

            filter: function (name, data) {
                var id, uid, value, attribute, key, keys, fragment, flag, list, startFragment,
                    endFragment, length, content, unit, isFound, index,
                    params = [];

                name = name ? "" + name : "";
                // парсим переданные параметры для фильтра
                startFragment = "("; endFragment = ")";
                if (name.indexOf(endFragment) > name.indexOf(startFragment)) {
                    fragment = app.lib.strim(name, startFragment, endFragment, false, false);
                    fragment = fragment.split('"').join("").split("'").join("");
                    name = app.lib.strim(name, "", startFragment, false, false);
                    params = fragment.split(app.val.delimParam);
                };
                // парсим цепочку ключей в имени фильтра
                startFragment = "["; endFragment = "]";
                fragment = name.split(endFragment + startFragment).join(app.val.delimId);
                fragment = fragment.split(startFragment).join(app.val.delimId);
                fragment = fragment.split(endFragment).join("");
                fragment = fragment.split('"').join("").split("'").join("");
                keys = fragment.split(app.val.delimId);
                switch (true) {// поддерживаемые форматы
                    case "phone" == name.toLowerCase():// телефонный номер
                        // очищаем значение
                        value = data ? app.lib.trim("" + data) : "";
                        value = value.replace(/\D/g, "");// оставляем только цыфры
                        if (!value.indexOf("8") && value.length > 10) value = "7" + value.substr(1);
                        // форматируем значение
                        list = [// массив значений для форматирования
                            { index: 0, length: value.length - 10 },
                            { index: value.length - 10, length: 3 },
                            { index: value.length - 7, length: 3 },
                            { index: value.length - 4, length: 2 },
                            { index: value.length - 2, length: 2 }
                        ];
                        for (var i = 0, iLen = list.length; i < iLen; i++) {
                            length = list[i].length + Math.min(0, list[i].index);
                            list[i] = value.substr(Math.max(0, list[i].index), Math.max(0, length));
                        };
                        if (!list[0] && list[1]) list[0] = 7;
                        value = "";// пустое значение
                        value += list[0] ? "+" + (list[0]) : "";
                        value += list[1] ? " (" + list[1] + ") " : "";
                        value += list[2] ? list[2] + "-" : "";
                        value += list[3] ? list[3] + (list[2] ? "-" : "") : "";
                        value += list[4] ? list[4] : "";
                        // возвращаем результат
                        return value;
                        break;
                    case "normal" == name.toLowerCase():// нормализация
                        // очищаем значение
                        value = data ? app.lib.trim("" + data) : "";
                        // убираем запрещённые символы
                        list = [160];// неразрывный пробел
                        fragment = value;// присваиваем значение
                        for (var i = 0, iLen = list.length; i < iLen; i++) {
                            key = String.fromCharCode(list[i]);// получаем символ
                            fragment = fragment.split(key).join("");
                        };
                        value = app.lib.trim(fragment);
                        // удаляем ключевые фразы в начале
                        list = ["FW:", "RE:"];
                        isFound = false;// найдено ли совпадение
                        for (var i = 0, iLen = list.length; i < iLen && !isFound; i++) {
                            key = list[i];// получаем очередной элимент
                            index = value.indexOf(key);
                            if (!index) isFound = true;
                        };
                        if (isFound) {// если найдено совпадение
                            fragment = value.substring(index + key.length);
                            value = app.lib.trim(fragment);
                        };
                        // удаляем единственные ключевые фразы в конце
                        list = [".", "!", "?"];
                        isFound = false;// найдено ли совпадение
                        for (var i = 0, iLen = list.length; i < iLen && !isFound; i++) {
                            key = list[i];// получаем очередной элимент
                            index = value.indexOf(key);
                            if (value.length - index == key.length) isFound = true;
                        };
                        if (isFound) {// если найдено совпадение
                            fragment = value.substring(0, index);
                            value = app.lib.trim(fragment);
                        };
                        // делаем первую букву заглавной
                        fragment = value;// присваиваем значение
                        if (fragment.charAt(0) == fragment.charAt(0).toLowerCase()) {
                            fragment = fragment.charAt(0).toUpperCase() + fragment.substring(1);
                        };
                        value = fragment;
                        // заменяем отдельные комбинации для cherwell
                        fragment = value;// присваиваем значение
                        fragment = fragment.split("  ").join(" ");
                        fragment = fragment.split(" \n").join("\n");
                        fragment = fragment.split("\n ").join("\n");
                        value = fragment;
                        // возвращаем результат
                        return value;
                        break;
                    case "hash" == name.toLowerCase():// хеш
                        // очищаем значение
                        value = data ? app.lib.trim("" + data) : "";
                        // форматируем значение
                        value = app.lib.strim(value, "#", "", false, false);
                        // возвращаем результат
                        return value;
                        break;
                    case "set" == name.toLowerCase():// проверка значения
                        // очищаем значение
                        value = data ? app.lib.trim("" + data) : "";
                        // форматируем значение
                        flag = true;// нужно ли вернуть значение
                        if (value) value = params.length > 0 ? (params[0] || value) : "true";
                        else value = params.length > 1 ? (params[1] || (flag = false)) : "false";
                        // возвращаем результат
                        if (flag) return value;
                        break;
                    case "map" == name.toLowerCase():// мапинг значений
                        // очищаем значение
                        value = data ? app.lib.trim("" + data) : "";
                        // форматируем значение
                        flag = false;// найдено ли совпадение
                        for (var i = 0, iLen = params.length; i < iLen; i++) {
                            if (~params[i].indexOf(app.val.delimMap)) {// если есть разделитель
                                key = app.lib.strim(params[i], "", app.val.delimMap, false, false);
                                if (value == key || !value && !key) {// если найдено совпадение
                                    value = app.lib.strim(params[i], app.val.delimMap, "", false, false);
                                    flag = true;
                                    break;
                                };
                            };
                        };
                        // возвращаем результат
                        if (flag) return value;
                        break;
                    case "user" == keys[0].toLowerCase():// пользователь
                        if (!unit) unit = { include: ["groups"].join(",") };
                    case "issue" == keys[0].toLowerCase():// задача
                        if (!unit) unit = { include: ["journals", "watchers"].join(",") };
                    case "project" == keys[0].toLowerCase():// проект
                        if (!unit) unit = { include: ["trackers"].join(",") };
                        // определяем идентификатор элимента
                        if (data && data.id) id = data.id;
                        else if (!isNaN(data)) id = data;
                        else id = null;
                        // получаем элимент данных
                        if (id) {// если есть идентификатор
                            key = keys.shift().toLowerCase();
                            data = app.api.redmine("get", key + "s/" + id, unit);
                            data = data[key] ? data[key] : null;
                        } else if (data) {// если не пустое значение
                            key = keys.shift().toLowerCase() + "s";
                            data = { name: data };// данные для запроса
                            data = app.api.redmine("get", key, data);
                            data = data[key] && 1 == data[key].length ? data[key][0] : null;
                        } else data = null;
                        // получаем цепочтку данных по ключам
                        unit = data;// получаем данные для проверки
                        flag = unit;// успешно получены данные
                        for (var k = 0, kLen = keys.length; flag && k < kLen; k++) {
                            key = keys[k];// получаем очередной ключ
                            if (!isNaN(key)) {// если это дополнительное поле
                                key = Number(key);
                                unit = unit.custom_fields;
                                flag = unit;// успешно получены данные
                                if (flag) {// если есть дополнительные поля
                                    flag = false;// найдено значение
                                    for (var j = 0, jLen = unit.length; !flag && j < jLen; j++) {
                                        flag = key == unit[j].id;// найдено значение
                                        if (flag) unit = unit[j].value;
                                    };
                                };
                            } else {// есди это обычное поле
                                flag = key in unit;// найдено значение
                                if (flag) unit = unit[key];
                            };
                        };
                        // возвращаем результат
                        if (flag) return unit;
                        break;
                    case "journal" == keys[0].toLowerCase():// журнал
                        // формируем служебные идентификаторы
                        id = "details";// идентификатор
                        key = keys.shift().toLowerCase() + "s";
                        value = keys.pop();// значение которое должно быть аттрибута
                        attribute = keys.join(app.val.delimId);// аттрибут для поиска значения
                        attribute = app.fun.getAttribute("original", attribute) || attribute;
                        // выполняем поиск соответствий
                        if (data && data[key]) {// если есть нужные данные
                            for (var i = 0, iLen = data[key].length; i < iLen; i++) {
                                if (data[key][i][id]) {// если есть нужные данные
                                    for (var j = 0, jLen = data[key][i][id].length; j < jLen; j++) {
                                        unit = data[key][i][id][j];// получаем очередной элимент
                                        content = unit.new_value || "";// новое полное значение аттрибута
                                        // выполняем проверку на соответствие
                                        content = app.fun.str2val(content);// преобразовывает строку в значение
                                        flag = app.lib.validate(content, "boolean");// нужно ли преобразовать значение
                                        flag = !app.lib.compare(content, flag ? (value ? true : false) : value);
                                        if (!flag && isNaN(content)) {// если не прошёл проверку на полное соответствие
                                            flag = app.lib.hasValue("" + value, content, false);
                                        };
                                        flag = flag && (!attribute || attribute == unit.name);
                                        if (flag) uid = data[key][i].user.id;
                                    };
                                };
                            };
                        };
                        // возвращаем результат
                        if (uid) return uid;
                        break;
                };
            },

            /**
             * Исправляет путь от url, добавляя слеш в конце.
             * @param {string} path - Путь от url для исправления.
             * @returns {string} Исправленный путь от url.
             */

            fixUrlPath: function (path) {
                var end = "/";

                if (path) {// если не пустой путь
                    if (path.substring(path.length - end.length) == end) {
                    } else path += end;
                } else path = end;
                // возвращаем результат
                return path;
            }
        },
        method: {// поддерживаемые методы

            /**
             * Синхранизация пользователей из источника данных.
             * @param {string} source - Параметры для подключения к active directory в формате <url>.
             * @param {string} fields - Поля и их значения в формате id:value;id:value с шаблонизацией.
             * @param {string} [auth] - Режим аутентификации в приложении.
             * @returns {number} Номер ошибки или нулевое значение.
             */

            "users.sync": function (source, fields, auth) {
                var data, list, unit, primary, id, value, status, item,
                    items, user, users = {}, error = 0;

                // получаяем данные для взаимодействия с источником
                if (!error) {// если нету ошибок
                    source = app.lib.url2obj(source);
                    if (app.lib.hasValue(["ldap"], source.scheme, false)) {
                        app.val.apiADPath = source.path || source.domain;
                    } else error = 7;
                };
                // получаем соответствие полей
                if (!error) {// если нету ошибок
                    fields = fields ? app.lib.str2obj(fields, false, app.val.delimKey, app.val.delimVal) : {};
                    for (var id in fields) {// пробегаемся по списку полученных полей
                        value = fields[id];// получаем очередное значение
                        if (value) fields[id] = value.split('"').join("").split("'").join("");
                        if (!primary) primary = id;
                    };
                    if (// множественное условие
                        fields["login"] && fields["firstname"]
                        && fields["mail"] && fields["lastname"]
                    ) {// если заполнены обязательные поля
                    } else error = 8;
                };
                // получаем массив пользователей ldap
                if (!error) {// если нету ошибок
                    items = app.api.ad("WHERE 'objectClass' = 'user'");
                };
                // преобразуем массив пользователей ldap в объект
                if (!error) {// если нету ошибок
                    for (var i = 0, iLen = items.length; i < iLen; i++) {
                        item = items[i];// получаем очередной элимент
                        user = app.fun.item2user(item, fields);
                        if (// множественное условие
                            user.login && user.firstname && user.lastname
                        ) {// если заполнены обязательные поля
                            if (!user.mail) {// если у пользователя нет почты
                                user.status = app.val.userLocked;
                                delete user.mail;
                            };
                            id = user[primary].toLowerCase();
                            if (id) users[id] = user;
                        };
                    };
                };
                // получаем список пользователей в приложении
                list = [app.val.userActive, app.val.userRegistered, app.val.userLocked];
                for (var items = [], i = 0, iLen = list.length; !error && i < iLen; i++) {
                    status = list[i];// получаем очередное значение статуса из списка значений
                    for (var data = null; !data || data.total_count > data.offset; data.offset += data.limit) {
                        data = { offset: data ? data.offset : 0, status: status };// данные для запроса
                        data = app.api.redmine("get", "users", data);// запрашиваем данные через api
                        if (!data.users) data.users = [];// приводим данные к единому виду
                        for (var j = 0, jLen = data.users.length; j < jLen; j++) {
                            item = data.users[j]// получаем очередной элимент
                            item.status = status;// задаём значение статуса
                            items.push(item);
                        };
                    };
                };
                // проверяем наличее пользователей
                if (!error) {// если нету ошибок
                    if (items.length) {// если есть пользователи
                    } else error = 9;
                };
                // обновляем данные у пользователей приложения
                if (!error) {// если нету ошибок
                    for (var i = 0, iLen = items.length; i < iLen; i++) {
                        item = items[i];// получаем очередной элимент
                        id = item[primary].toLowerCase();
                        user = users[id];// получаем пользователя
                        if (user) {// если пользователь есть в ldap
                            unit = app.lib.difference(user, item, function (one, two) {
                                return one.id == two.id && one.value != two.value;
                            });
                            if (unit) {// если необходимо обновить данные
                                if (auth) unit.auth_source_id = auth;
                                data = { user: unit };// данные для запроса
                                data = app.api.redmine("put", "users/" + item.id, data);
                            };
                            delete users[id];
                        };
                    };
                };
                // регистрируем новых пользователей
                if (!error) {// если нету ошибок
                    for (var id in users) {// пробигаемся по пользователям
                        user = users[id];// получаем пользователя
                        if (app.val.userActive == user.status) {// если активный пользователь
                            if (auth) user.auth_source_id = auth;
                            data = { user: user };// данные для запроса
                            data = app.api.redmine("post", "users", data);
                        };
                        delete users[id];
                    };
                };
                // возвращаем результат
                return error;
            },

            /**
             * Синхранизация задач в приёмник данных.
             * @param {string} destination - Параметры для подключения к cherwell в формате url.
             * @param {number} query - Идентификатор сохранённого запроса для всех проектов и двух систем.
             * @param {string} [filters] - Дополнительный фильтр в формате id:value,value;id:value,value с шаблонизацией.
             * @param {string} fields - Поля и их значения в формате в формате id:value;id:value с шаблонизацией.
             * @returns {number} Номер ошибки или нулевое значение.
             */

            "issues.sync": function (destination, query, filters, fields) {
                var key, value, filter, data, unit, flag, item, items, index,
                    ownerId, busObId, fieldId, primary, id, isFound, list,
                    ticket, tickets = {}, map = {}, error = 0;

                // корректируем порядок входных параметров
                if (!fields) { fields = filters; filters = null; };
                // проверяем указание идентификатора запроса
                if (!error) {// если нету ошибок
                    if (query && !isNaN(query)) {// если параметр прошёл проверку
                    } else error = 7;
                };
                // получаяем данные для взаимодействия с приёмником
                if (!error) {// если нету ошибок
                    destination = app.lib.url2obj(destination);
                    // получаем информацию о key
                    if (!error) {// если нету ошибок
                        if (destination.fragment) {// если параметр прошёл проверку
                            app.val.apiCherwellClient = destination.fragment;
                            delete destination.fragment;
                        } else error = 8;
                    };
                    // получаем информацию о логине и пароле
                    if (!error) {// если нету ошибок
                        if (destination.password && destination.user) {// если параметр прошёл проверку
                            app.val.apiCherwellUser = destination.user;
                            app.val.apiCherwellPassword = destination.password;
                            delete destination.password;
                            delete destination.user;
                        } else error = 9;
                    };
                    // получаем информацию о базавом url
                    if (!error) {// если нету ошибок
                        if (destination.scheme && destination.domain) {// если параметр прошёл проверку
                            destination.path = app.fun.fixUrlPath(destination.path);
                            app.val.apiCherwellUrl = app.lib.obj2url(destination);
                        } else error = 10;
                    };
                };
                // получаем значения для фильтров
                if (!error) {// если нету ошибок
                    filters = filters ? app.lib.str2obj(filters, false, app.val.delimKey, app.val.delimVal) : null;
                    if (filters) {// если удалось получить список фильтров и значения для них
                        for (var id in filters) {// пробегаемся по списку полученных фильтров
                            value = filters[id];// получаем очередное значение
                            if (value) filters[id] = value.split('"').join("").split("'").join("");
                        };
                    };
                };
                // получаем соответствие полей
                if (!error) {// если нету ошибок
                    fields = fields ? app.lib.str2obj(fields, false, app.val.delimKey, app.val.delimVal) : {};
                    for (var id in fields) {// пробегаемся по списку полученных полей
                        value = fields[id];// получаем очередное значение
                        if (value) fields[id] = value.split('"').join("").split("'").join("");
                        if (!primary) primary = id;
                    };
                    if (// множественное условие
                        fields["SuppliersReference"] && !fields["IncidentID"]
                    ) {// если заполнены обязательные поля
                    } else error = 11;
                };
                // получаем идентификатор пользователя
                if (!error) {// если нету ошибок
                    data = app.api.cherwell("get", "getuserbyloginid/loginid/" + app.val.apiCherwellUser);
                    if (data.recordId) {// если данные получены
                        ownerId = data.recordId;
                    } else error = 12;
                };
                // получаем идентификатор класса для тикетов
                if (!error) {// если нету ошибок
                    data = app.api.cherwell("get", "getbusinessobjectsummary/busobname/Incident");
                    if (data.length && data[0].busObId) {// если данные получены
                        busObId = data[0].busObId;
                    } else error = 13;
                };
                // получаем список полей для тикетов 
                if (!error) {// если нету ошибок
                    data = app.api.cherwell("get", "getbusinessobjectschema/busobid/" + busObId);
                    if (data.fieldDefinitions) {// если данные получены
                        items = data.fieldDefinitions;// задаём список
                        map.fields = {};// сбрасываем значение
                        for (var id in fields) {// пробегаемся по списку полученных полей
                            isFound = false;// сбрасываем значение
                            list = [id, "IncidentID"];// список идентификаторов
                            for (var i = 0, iLen = items.length; i < iLen; i++) {
                                item = items[i];// получаем очередной элимент
                                for (var j = 0, jLen = list.length; j < jLen; j++) {
                                    key = list[j];// получаем очередной идентификатор
                                    if (item.name == key) {// если найдено совпадение
                                        map.fields[item.name] = item.fieldId;
                                        if (!j) isFound = true;
                                    };
                                };
                            };
                            if (isFound) {// если совподение найдено
                            } else error = 15;
                        };
                    } else error = 14;
                };
                // получаем список тикетов
                if (!error) {// если нету ошибок
                    for (var i = 1, items = [], data = null; !data || data.hasMoreRecords && !error; i++) {
                        data = { pagenumber: i };// данные для запроса
                        data = app.api.cherwell("get", "getsearchresults/association/" + busObId + "/scope/User/scopeowner/" + ownerId + "/searchname/" + query, data);
                        if (!data.hasError && data.businessObjects) {// нет ошибок
                            items = items.concat(data.businessObjects);
                        } else error = 16;
                    };
                };
                // преобразуем массив тикетов в объект
                if (!error) {// если нету ошибок
                    for (var i = 0, iLen = items.length; i < iLen; i++) {
                        item = items[i];// получаем очередной элимент
                        ticket = {};// создаём пустой элимент
                        for (var j = 0, jLen = item.fields.length; j < jLen; j++) {
                            fieldId = map.fields[item.fields[j].name];// получаем идентификатор поля
                            if (fieldId) {// если поле нужно для дальнейшей обработки
                                value = item.fields[j].value;
                                // убираем не синхронизируемые символы
                                list = [160, 13];// неразрывный пробел, возврат каретки
                                for (var k = 0, kLen = list.length; value && k < kLen; k++) {
                                    key = String.fromCharCode(list[k]);// получаем символ
                                    value = ("" + value).split(key).join("");
                                };
                                // присваиваем значение
                                ticket[fieldId] = value;
                            };
                        };
                        id = ticket[map.fields[primary]];
                        if (id) tickets[id] = ticket;
                    };
                };
                // получаем список задач в приложении
                if (!error) {// если нету ошибок
                    for (var items = [], data = null; !data || data.total_count > data.offset; data.offset += data.limit) {
                        data = { offset: data ? data.offset : 0 };// данные для запроса
                        if (query) data.query_id = query;// фильтр по идентификатору запроса
                        data = app.api.redmine("get", "issues", data);// запрашиваем данные через api
                        if (data.issues) items = items.concat(data.issues);
                    };
                };
                // синхранизируем задачи в приёмник
                if (!error) {// если нету ошибок
                    for (var i = 0, iLen = items.length; i < iLen; i++) {
                        item = items[i];// получаем очередной элимент
                        // добавляем пользовательские ключи
                        item["true"] = true;// для проверки наличия значения
                        item["false"] = false;// для проверки отсутствия значения
                        for (var key in item) {// пробигаемся по задаче
                            unit = item[key];// запоминаем значение
                            key = app.fun.getAttribute("custom", key);
                            if (key) item[key] = unit;
                        };
                        // проверяем задачу на соответствие фильтрам
                        flag = true;// задача удовлетворяет фильтрам
                        if (filters) {// если нужно применить фильтры к задаче
                            for (var id in filters) {// пробегаемся по полям
                                filter = filters[id];// получаем очередное значение
                                // получаем значение из конечного поля
                                if (!isNaN(id)) {// если дополнительное поле
                                    flag = false;// задача не удовлетворяет фильтру
                                    list = item.custom_fields ? item.custom_fields : [];
                                    for (var j = 0, jLen = list.length; !flag && j < jLen; j++) {
                                        unit = list[j];// получаем значение очередного поля
                                        flag = unit.id == Number(id);// найдено значение
                                        if (flag) value = unit.value;
                                    };
                                } else {// если не дополнительное поле
                                    value = data = item;// берём элимент для анализа
                                    list = id.split(app.val.delimId);// получаем цепочку ключей
                                    for (var j = 0, jLen = list.length; flag && j < jLen; j++) {
                                        key = list[j];// получаем очередной ключ
                                        flag = key in data;// найдено значение
                                        if (flag) value = data = data[key];
                                    };
                                };
                                // проверяем значение на соответствие фильтру
                                if (flag) {// если есть что проверять
                                    if (filter) filter = app.lib.template(filter, item, app.fun.filter);
                                    list = filter.split(app.val.delimParam);// разделяем на отдельные значения
                                    flag = false;// сбрасываем значение перед проверкой
                                    for (var j = 0, jLen = list.length; j < jLen && !flag; j++) {
                                        filter = list[j];// получаем очередное значение
                                        filter = app.fun.str2val(filter);// преобразовывает строку в значение
                                        flag = app.lib.validate(filter, "boolean");// нужно ли преобразовать значение
                                        flag = !app.lib.compare(filter, flag ? (value ? true : false) : value);
                                        if (!flag && isNaN(filter)) {// если не прошёл проверку на полное соответствие
                                            flag = app.lib.hasValue("" + value, filter, false);
                                        };
                                    };
                                };
                                // прерываем если не прошли проверку
                                if (!flag) break;
                            };
                        };
                        // готовим данные для обновления
                        if (flag) {// если нужно подготовить данные
                            unit = null;// сбрасываем значение
                            ticket = null;// сбрасываем значение
                            index = 0;// счётчик колличества полей
                            for (var id in fields) {// пробегаемся по полям
                                if (!unit) unit = {};// создаём объект для данных
                                // формируем значение
                                value = fields[id];// получаем очередное значение
                                if (value) value = app.lib.template(value, item, app.fun.filter);
                                value = app.fun.str2val(value);
                                // присваиваем значение
                                fieldId = map.fields[id];
                                if (id == primary) ticket = tickets[value];
                                if (!ticket || ticket[fieldId] != value) index++;
                                unit[fieldId] = value;
                            };
                        };
                        // обновляем данные в тикете или создаём новый
                        if (flag && index) {// если необходимо обновить данные
                            data = { "busObId": busObId, "persist": true, "fields": [] };
                            if (ticket) data["busObPublicId"] = ticket[map.fields["IncidentID"]];
                            for (var fieldId in unit) {// пробегаемся по полям
                                data.fields.push({
                                    "value": unit[fieldId],
                                    "fieldId": fieldId,
                                    "dirty": true
                                });
                            };
                            data = app.api.cherwell("post", "savebusinessobject", data);
                        };
                    };
                };
                // возвращаем результат
                return error;
            },

            /**
             * Изменяет уже существующие задачи в сохранённом запросе.
             * @param {number} [query] - Идентификатор сохранённого запроса для всех проектов.
             * @param {string} [filters] - Дополнительный фильтр в формате id:value,value;id:value,value с шаблонизацией.
             * @param {string} fields - Изменяемые поля и их значения в формате id:value;id:value с шаблонизацией.
             * @returns {number} Номер ошибки или нулевое значение.
             */

            "issues.change": function (query, filters, fields) {
                var key, value, filter, data, unit, flag, item, items,
                    watcher, watchers, index, error = 0;

                // корректируем порядок входных параметров
                if (isNaN(query)) { fields = filters; filters = query; query = null; };
                if (!fields) { fields = filters; filters = null; };
                // получаем значения для фильтров
                if (!error) {// если нету ошибок
                    filters = filters ? app.lib.str2obj(filters, false, app.val.delimKey, app.val.delimVal) : null;
                    if (filters) {// если удалось получить список фильтров и значения для них
                        for (var id in filters) {// пробегаемся по списку полученных фильтров
                            value = filters[id];// получаем очередное значение
                            if (value) filters[id] = value.split('"').join("").split("'").join("");
                        };
                    };
                };
                // получаем значения для изменяемых полей
                if (!error) {// если нету ошибок
                    fields = fields ? app.lib.str2obj(fields, false, app.val.delimKey, app.val.delimVal) : null;
                    if (fields) {// если удалось получить список полей и значения для их изменения
                        for (var id in fields) {// пробегаемся по списку полученных полей
                            value = fields[id];// получаем очередное значение
                            if (value) fields[id] = value.split('"').join("").split("'").join("");
                        };
                    } else error = 7;
                };
                // получаем список задач в приложении
                if (!error) {// если нету ошибок
                    for (var items = [], data = null; !data || data.total_count > data.offset; data.offset += data.limit) {
                        data = { offset: data ? data.offset : 0 };// данные для запроса
                        if (query) data.query_id = query;// фильтр по идентификатору запроса
                        data = app.api.redmine("get", "issues", data);// запрашиваем данные через api
                        if (data.issues) items = items.concat(data.issues);
                    };
                };
                // выполняем действие над задачами
                if (!error) {// если нету ошибок
                    for (var i = 0, iLen = items.length; i < iLen; i++) {
                        item = items[i];// получаем очередной элимент
                        // добавляем пользовательские ключи
                        item["true"] = true;// для проверки наличия значения
                        item["false"] = false;// для проверки отсутствия значения
                        for (var key in item) {// пробигаемся по задаче
                            unit = item[key];// запоминаем значение
                            key = app.fun.getAttribute("custom", key);
                            if (key) item[key] = unit;
                        };
                        // проверяем задачу на соответствие фильтрам
                        flag = true;// задача удовлетворяет фильтрам
                        if (filters) {// если нужно применить фильтры к задаче
                            for (var id in filters) {// пробегаемся по полям
                                filter = filters[id];// получаем очередное значение
                                // получаем значение из конечного поля
                                if (!isNaN(id)) {// если дополнительное поле
                                    flag = false;// задача не удовлетворяет фильтру
                                    list = item.custom_fields ? item.custom_fields : [];
                                    for (var j = 0, jLen = list.length; !flag && j < jLen; j++) {
                                        unit = list[j];// получаем значение очередного поля
                                        flag = unit.id == Number(id);// найдено значение
                                        if (flag) value = unit.value;
                                    };
                                } else {// если не дополнительное поле
                                    value = data = item;// берём элимент для анализа
                                    list = id.split(app.val.delimId);// получаем цепочку ключей
                                    for (var j = 0, jLen = list.length; flag && j < jLen; j++) {
                                        key = list[j];// получаем очередной ключ
                                        flag = key in data;// найдено значение
                                        if (flag) value = data = data[key];
                                    };
                                };
                                // проверяем значение на соответствие фильтру
                                if (flag) {// если есть что проверять
                                    if (filter) filter = app.lib.template(filter, item, app.fun.filter);
                                    list = filter.split(app.val.delimParam);// разделяем на отдельные значения
                                    flag = false;// сбрасываем значение перед проверкой
                                    for (var j = 0, jLen = list.length; j < jLen && !flag; j++) {
                                        filter = list[j];// получаем очередное значение
                                        filter = app.fun.str2val(filter);// преобразовывает строку в значение
                                        flag = app.lib.validate(filter, "boolean");// нужно ли преобразовать значение
                                        flag = !app.lib.compare(filter, flag ? (value ? true : false) : value);
                                        if (!flag && isNaN(filter)) {// если не прошёл проверку на полное соответствие
                                            flag = app.lib.hasValue("" + value, filter, false);
                                        };
                                    };
                                };
                                // прерываем если не прошли проверку
                                if (!flag) break;
                            };
                        };
                        // готовим данные для обновления
                        if (flag) {// если нужно подготовить данные
                            unit = null;// сбрасываем значение
                            index = 0;// счётчик колличества полей
                            for (var id in fields) {// пробегаемся по полям
                                if (!unit) unit = {};// создаём объект для данных
                                // формируем значение
                                value = fields[id];// получаем очередное значение
                                if (value) value = app.lib.template(value, item, app.fun.filter);
                                value = app.fun.str2val(value);
                                // унифицируем идентификатор
                                id = app.fun.getAttribute("original", id) || id;
                                // обрабатываем специализированные поля
                                switch (id) {// поддерживаемые поля
                                    case "watcher":// наблюдатель
                                        // проверяем значение
                                        if (value) {// если требуются изменения 
                                            if (!isNaN(value)) {// если проверка пройдена
                                                value = Number(value);
                                            } else value = false;
                                        };
                                        // получаем список наблюдателей
                                        if (value) {// если требуются изменения 
                                            data = { include: "watchers" };// данные для запроса
                                            data = app.api.redmine("get", "issues/" + item.id, data);
                                            if (data.issue && data.issue.watchers) {// если наблюдатели получены
                                                watchers = data.issue.watchers;// массив наблюдателей
                                            } else value = false;
                                        };
                                        // ищем наблюдателя в списке
                                        if (value) {// если требуются изменения 
                                            watcher = null;// сбрасываем значение
                                            for (var j = 0, jLen = watchers.length; !watcher && j < jLen; j++) {
                                                watcher = watchers[j];// получаем очередной элимент
                                                if (Math.abs(value) != watcher.id) watcher = null;
                                            };
                                        };
                                        // добавляем или удаляем наблюдателя
                                        if (value) {// если требуются изменения 
                                            if (value > 0 && !watcher) {// если нужно добавить
                                                data = { user_id: value };// данные
                                                data = { watcher: data };// данные для запроса
                                                data = app.api.redmine("post", "issues/" + item.id + "/watchers", data);
                                            };
                                            if (value < 0 && watcher) {// если нужно удалить
                                                value = Math.abs(value);
                                                data = app.api.redmine("delete", "issues/" + item.id + "/watchers/" + value);
                                            };
                                        };
                                        // завершаем обработку
                                        id = null;
                                        break;
                                };
                                // присваиваем значение
                                if (id) {// если идентификатор не сброшен
                                    if (!isNaN(id)) {// если дополнительное поле
                                        if (!unit.custom_fields) unit.custom_fields = [];
                                        unit.custom_fields.push({ id: id, value: value });
                                    } else unit[id] = value;
                                    index++;
                                };
                            };
                        };
                        // обновляем данные в заявке
                        if (flag && index) {// если необходимо обновить данные
                            data = { issue: unit };// данные для запроса
                            data = app.api.redmine("put", "issues/" + item.id, data);
                        };
                    };
                };
                // возвращаем результат
                return error;
            }
        },
        api: {// взаимодействие с различными приложениями

            /**
             * Программный интерфейс взаимодействия с redmine.
             * @param {string} [method] - Метод http для запроса.
             * @param {string} request - Адрес uri запроса без расширения.
             * @param {object} [data] - Данные отправляемые в запросе.
             * @returns {object} Данные которые вернуло api.
             */

            redmine: function (method, request, data) {
                var xhr, url, flag, head, response = {}, error = 0;

                // определяем необходимость конвертации данных
                if (!error) {// если нету ошибок
                    switch (method.toLowerCase()) {// совместимые методы
                        case "get": flag = false; break;
                        case "head": flag = false; break;
                        case "delete": flag = false; break;
                        default: flag = true;
                    };
                };
                // конвертируем отправляемые данные
                if (!error && data && flag) {// если нужно выполнить
                    data = app.fun.obj2xml(data);
                    if (data) {// если данные сконвертированы
                    } else error = 1;
                };
                // делаем запрос на сервер
                if (!error) {// если нету ошибок
                    url = app.val.apiReadmineUrl + request + ".xml";
                    head = {// заголовки запроса
                        "Cache-Control": "no-store",
                        "If-None-Match": "empty"
                    };
                    if (app.val.apiReadmineKey) head["X-Redmine-API-Key"] = app.val.apiReadmineKey;
                    xhr = app.lib.xhr(method, url, head, data, false, null, app.val.apiReadmineUser, app.val.apiReadminePassword);
                    data = xhr.responseXML;
                    if (app.lib.validate(data, 'xml')) {// если ответ получен
                    } else error = 2;
                };
                // конвертируем полученные данные
                if (!error) {// если нету ошибок
                    data = app.fun.xml2obj(xhr.responseXML);
                    if (data) {// если данные сконвертированы
                        response = data;
                    } else error = 3;
                };
                // возвращаем результат
                return response;
            },

            /**
             * Программный интерфейс взаимодействия с redmine.
             * @param {string} [method] - Метод http для запроса.
             * @param {string} request - Адрес uri запроса без расширения.
             * @param {object} [data] - Данные отправляемые в запросе.
             * @returns {object} Данные которые вернуло api.
             */

            cherwell: function (method, request, data) {
                var xhr, url, flag, token, response = {}, error = 0;

                // получаем токен для запросов
                if (!error && !app.val.apiCherwellToken) {// если нет токена
                    url = app.val.apiCherwellUrl + "token";
                    xhr = new ActiveXObject("MSXML2.ServerXMLHTTP");
                    xhr.open("post".toUpperCase(), url, false);
                    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                    xhr.send(app.lib.obj2str({// отправляемые данные
                        "client_id": app.val.apiCherwellClient,
                        "username": app.val.apiCherwellUser,
                        "password": app.val.apiCherwellPassword,
                        "grant_type": "password"
                    }, true));
                    if (xhr.responseText && 200 == xhr.status) {// если получен ответ
                        token = JSON.parse(xhr.responseText).access_token;
                        if (token) {// если удалось получить токен
                            app.val.apiCherwellToken = token;
                        } else error = 2;
                    } else error = 1;
                };
                // определяем необходимость конвертации данных
                if (!error) {// если нету ошибок
                    switch (method.toLowerCase()) {// совместимые методы
                        case "get": flag = false; break;
                        case "head": flag = false; break;
                        case "delete": flag = false; break;
                        default: flag = true;
                    };
                };
                // конвертируем отправляемые данные
                if (!error && data && flag) {// если нужно выполнить
                    data = JSON.stringify(data);
                };
                // добавляем данные в адрес запроса
                if (!error && data && !flag) {// если нужно выполнить
                    data = app.lib.obj2str(data, true);
                    if (~request.indexOf("?")) request += "&";
                    else request += "?";
                    request += data;
                    data = null;
                };
                // делаем запрос на сервер
                if (!error) {// если нету ошибок
                    url = app.val.apiCherwellUrl + "api/V1/" + request;
                    xhr = new ActiveXObject("MSXML2.ServerXMLHTTP");
                    xhr.open(method.toUpperCase(), url, false);
                    xhr.setRequestHeader("Accept", "application/json");
                    xhr.setRequestHeader("Content-Type", "application/json");
                    xhr.setRequestHeader("Authorization", "Bearer " + app.val.apiCherwellToken);
                    try {// пробуем отправить данные
                        if (data) xhr.send(data); else xhr.send();
                        if (xhr.responseText && 200 == xhr.status) {// если получен ответ
                        } else error = 4;
                    } catch (e) {// если возникли ошибки
                        error = 3;
                    };
                };
                // конвертируем полученные данные
                if (!error) {// если нету ошибок
                    data = JSON.parse(xhr.responseText);
                    if (data) {// если данные сконвертированы
                        response = data;
                    } else error = 5;
                };
                // возвращаем результат
                return response;
            },

            /**
             * Программный интерфейс взаимодействия с active directory
             * @param {string} query - Запрос для получения данных.
             * @returns {array} Данные которые вернуло api.
             */

            ad: function (query) {
                var response;

                response = app.wsh.ldap(query, app.val.apiADPath);
                // возвращаем результат
                return response;
            }
        },
        init: function () {// функция инициализации приложения
            var value, instance, method, list = [], index = 0, error = 0;

            // получаем параметры для подключения к api redmine
            if (!error) {// если нету ошибок
                if (index < wsh.arguments.length) {// если передан параметр
                    value = wsh.arguments(index);// получаем очередное значени
                    instance = app.lib.url2obj(value);
                    // получаем информацию о key
                    if (!error && instance.fragment) {// если нужно выполнить
                        if (!instance.user && !instance.password) {// если параметр прошёл проверку
                            app.val.apiReadmineKey = instance.fragment;
                            delete instance.fragment;
                        } else error = 2;
                    };
                    // получаем информацию о логине и пароле
                    if (!error && instance.user) {// если нужно выполнить
                        if (instance.password && !instance.fragment) {// если параметр прошёл проверку
                            app.val.apiReadmineUser = instance.user;
                            app.val.apiReadminePassword = instance.password;
                            delete instance.password;
                            delete instance.user;
                        } else error = 3;
                    };
                    // получаем информацию о базавом url
                    if (!error) {// если нету ошибок
                        if (instance.scheme && instance.domain) {// если параметр прошёл проверку
                            instance.path = app.fun.fixUrlPath(instance.path);
                            app.val.apiReadmineUrl = app.lib.obj2url(instance);
                        } else error = 4;
                    };
                } else error = 1;
                index++;
            };
            // получаем идентификатор метода
            if (!error) {// если нету ошибок
                if (index < wsh.arguments.length) {// если передан параметр
                    value = wsh.arguments(index);// получаем очередное значени
                    method = app.method[value];// получаем функцию метода
                    if (method) {// если метод поддерживается
                    } else error = 6;
                } else error = 5;
                index++;
            };
            // формируем список параметров для вызова метода
            if (!error) {// если нету ошибок
                for (var i = index, iLen = wsh.arguments.length; i < iLen; i++) {
                    value = wsh.arguments(i);// получаем очередное значение
                    list.push(value);// добавляем значение в список
                };
            };
            // выполняем поддерживаемый метод
            if (!error) {// если нету ошибок
                error = method.apply(app, list);
            };
            // завершаем сценарий кодом
            wsh.quit(error);
        }
    });
})(readmine, WSH);

// инициализируем приложение
readmine.init();