/* 0.1.1d взаимодействие с redmine по средствам api

cscript redmine.min.js <url> <key> <method> [... <param>]
cscript redmine.min.js <url> <key> users.sync <fields> [<container>] [<auth>]
cscript redmine.min.js <url> <key> issues.change [<query>] <fields> [<filters>]

<url>               - базовый url адрес для запросов к api
<key>               - ключ доступа к api для взаимодействия
<method>            - собственный метод который нужно выполнить
    users.sync      - синхранизация пользователей из ldap
        <fields>    - id поля и имени аттрибута LDAP в формате id:name#format;id:name
        <container> - контейнер пользователей в LDAP
        <auth>      - id режима аутентификации в приложении
    issues.change   - изменение задач в сохранённом запросе
        <query>     - id сохранённого запроса для всех проектов
        <fields>    - поля и их значения в формате id:value;id:value с шаблонизацией
        <filters>   - фильтр в формате id:value;id:value с шаблонизацией

*/

var readmine = new App({
    apiKey: null,       // ключ доступа к api приложения
    apiUrl: null,       // базовый url адрес для запросов к api
    delimVal: ":",      // разделитель значения от ключа
    delimKey: ";",      // разделитель ключей между собой
    delimId: ".",       // разделитель идентификаторов в ключе
    delimFormat: "#",   // разделитель формата в значении
    stActive: 1,        // статус активного пользователя
    stRegistered: 2,    // статус зарегистрированного пользователя
    stLocked: 3         // статус заблокированного пользователя
});

// подключаем зависимые свойства приложения
(function (app, wsh, undefined) {// замыкаем чтобы не засорять глабальные объекты
    app.lib.extend(app, {// добавляем частный функционал приложения
        cache: {// кешируемые занные
            "user": {} // информация о пользователях
        },
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
                    case !isNaN(input): value = Number(input); break;
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
             * Преобразует элимент LDAP в объект пользователя.
             * @param {object} item - Элимент с данными для конвертации.
             * @param {object} fields - Объект соответствия id поля и имени аттрибута LDAP.
             * @returns {object} Объект пользователя.
             */

            item2user: function (item, fields) {// конвертируем элимент в пользователя
                var key, value, flag, field, unit, manager, user = {}, error = 0;

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
                    user.status = !flag ? app.val.stActive : app.val.stLocked;
                    key = item.get("distinguishedName");
                    app.cache['user'][key] = user;
                };
                // получаем значение для полей
                if (!error) {// если нету ошибок
                    for (var id in fields) {// пробигаемся по соответствию
                        // получаем значение для поля
                        field = fields[id];// получаем поле
                        value = "";// сбрасываем значение
                        try {// пробуем получить значение поля
                            value = item.get(field.name);
                        } catch (e) { };// игнорируем исключения
                        if (field.format) value = app.fun.format(field.format, value);
                        // преобразовываем нектрые значения
                        switch (field.name) {// дополнительные преобразования
                            case "manager":// руководитель
                                manager = null;// сбрасываем значение менеджера
                                if (value && value != key) {// если есть значение
                                    manager = app.cache['user'][value];
                                    if (!manager) {// если кеш пуст
                                        unit = app.wsh.getLDAP(value)[0];
                                        if (unit) {// если элимент получен
                                            manager = app.fun.item2user(unit, fields);
                                            app.cache['user'][value] = manager;
                                        };
                                    };
                                };
                                value = "";// сбрасываем значение
                                flag = manager && app.val.stActive == manager.status;
                                if (flag) {// если есть руководитель и он не заблокирован
                                    switch (field.format) {// поддерживаемые форматы
                                        case "firstname_lastname":
                                            value = [// формируем значение
                                                manager.firstname,
                                                manager.lastname
                                            ].join(" ");
                                            break
                                        case "firstname_lastinitial":
                                            value = [// формируем значение
                                                manager.firstname,
                                                manager.lastname.charAt(0) + "."
                                            ].join(" ");
                                            break
                                        case "firstinitial_lastname":
                                            value = [// формируем значение
                                                manager.firstname.charAt(0) + ".",
                                                manager.lastname
                                            ].join(" ");
                                            break
                                        case "firstname":
                                            value = manager.firstname;
                                            break
                                        case "lastnamefirstname":
                                            value = [// формируем значение
                                                manager.lastname,
                                                manager.firstname
                                            ].join("");
                                            break
                                        case "lastname_comma_firstname":
                                            value = [// формируем значение
                                                manager.lastname,
                                                manager.firstname
                                            ].join(", ");
                                            break
                                        case "lastname":
                                            value = manager.lastname;
                                            break
                                        case "username":
                                            value = manager.login;
                                            break
                                        case "lastname_firstname":
                                        default:// другие варианты
                                            value = [// формируем значение
                                                manager.lastname,
                                                manager.firstname
                                            ].join(" ");
                                    };
                                };
                                break;
                        };
                        // присваиваем значения
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
             * Форматирует переданные данные.
             * @param {string} name - Имя фильтра для форматирования.
             * @param {string|number} value - Значение для форматирования.
             * @returns {string} Отформатированное или пустое значение.
             */

            format: function (name, value) {
                var length, list = [];

                name = name ? ("" + name).toLowerCase() : "";
                switch (name) {// поддерживаемые форматы
                    case "phone":// телефонный номер
                        // очищаем значение
                        value = value ? app.lib.trim("" + value) : "";
                        value = value.replace(/\D/g, "");// оставляем только цыфры
                        if (!value.indexOf("8") && value.length > 10) value = "7" + value.substr(1);
                        // форматируем значение
                        list = [// массив значений для форматирования
                            { position: 0, length: value.length - 10 },
                            { position: value.length - 10, length: 3 },
                            { position: value.length - 7, length: 3 },
                            { position: value.length - 4, length: 2 },
                            { position: value.length - 2, length: 2 }
                        ];
                        for (var i = 0, iLen = list.length; i < iLen; i++) {
                            length = list[i].length + Math.min(0, list[i].position);
                            list[i] = value.substr(Math.max(0, list[i].position), Math.max(0, length));
                        };
                        if (!list[0] && list[1]) list[0] = 7;
                        value = "";// пустое значение
                        value += list[0] ? "+" + (list[0]) : "";
                        value += list[1] ? " (" + list[1] + ") " : "";
                        value += list[2] ? list[2] + "-" : "";
                        value += list[3] ? list[3] + (list[2] ? "-" : "") : "";
                        value += list[4] ? list[4] : "";
                        break;
                    default:// не известный формат
                        value = "";
                        break;
                };
                // возвращаем результат
                return value;
            }
        },
        method: {// поддерживаемые методы

            /**
             * Синхранизирует пользователей из LDAP в приложение.
             * @param {string} fields - Соответствие id поля и имени аттрибута LDAP в формате id:name#format;id:name.
             * @param {string} [container] - Контейнер пользователей в LDAP.
             * @param {string} [auth] - Режим аутентификации в приложении.
             * @returns {number} Количество изменённых пользователей.
             */

            "users.sync": function (fields, container, auth) {
                var data, list, unit, login, id, value, status, item, items,
                    field, flag, user, users = {}, count = 0, error = 0;

                // получаем соответствие полей
                if (!error) {// если нету ошибок
                    fields = fields ? app.lib.str2obj(fields, false, app.val.delimKey, app.val.delimVal) : {};
                    for (var id in fields) {// пробегаемся по списку полученных полей
                        value = fields[id].split("'").join("");
                        field = {// объект данных поля
                            name: value.split(app.val.delimFormat)[0],
                            format: value.split(app.val.delimFormat)[1]
                        };
                        fields[id] = field;
                    };
                    // проверяем наличее обязательных полей
                    flag = true;// проверка пройдена
                    list = ["login", "firstname", "lastname", "mail"];
                    for (var i = 0, iLen = list.length; flag && i < iLen; i++) {
                        id = list[i];// получаем очередной идентификатор для поля
                        flag = flag && fields[id] && fields[id].name;
                    };
                    if (flag) {// если есть обязательные поля
                    } else error = 1;
                };
                // получаем массив пользователей ldap
                if (!error) {// если нету ошибок
                    items = app.wsh.getLDAP(
                        "WHERE 'objectClass' = 'user'"
                        + " AND '" + fields["firstname"].name + "' = '*'"
                        + " AND '" + fields["lastname"].name + "' = '*'"
                        + " AND '" + fields["login"].name + "' = '*'"
                        + " AND '" + fields["mail"].name + "' = '*'",
                        container
                    );
                };
                // преобразуем массив пользователей ldap в объект
                for (var i = 0, iLen = items.length; !error && i < iLen; i++) {
                    item = items[i];// получаем очередной элимент
                    user = app.fun.item2user(item, fields);
                    if (user.login) {// если у пользователя есть логин
                        login = user.login.toLowerCase();
                        users[login] = user;
                    } else error = 2;
                };
                // получаем список пользователей в приложении
                list = [app.val.stActive, app.val.stRegistered, app.val.stLocked];
                for (var items = [], i = 0, iLen = list.length; !error && i < iLen; i++) {
                    status = list[i];// получаем очередное значение статуса из списка значений
                    for (var data = null; !data || data.total_count > data.offset; data.offset += data.limit) {
                        data = { offset: data ? data.offset : 0, status: status };// данные для запроса
                        data = app.api("get", "users", data);// запрашиваем данные через api
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
                    } else error = 3;
                };
                // обновляем данные у пользователей приложения
                for (var i = 0, iLen = items.length; !error && i < iLen; i++) {
                    item = items[i];// получаем очередной элимент
                    login = item.login.toLowerCase();
                    user = users[login];// получаем пользователя
                    if (user) {// если пользователь есть в ldap
                        unit = app.lib.difference(user, item, function (one, two) {
                            return one.id == two.id && one.value != two.value;
                        });
                        if (unit) {// если необходимо обновить данные
                            if (auth) unit.auth_source_id = auth;
                            data = { user: unit };// данные для запроса
                            data = app.api("put", "users/" + item.id, data);
                            if (data.user) count++;// увеличиваем счётчик
                        };
                        delete users[login];
                    };
                };
                // регистрируем новых пользователей
                if (!error) {// если нету ошибок
                    for (var login in users) {// пробигаемся по пользователям
                        user = users[login];// получаем пользователя
                        if (app.val.stActive == user.status) {// если активный пользователь
                            if (auth) user.auth_source_id = auth;
                            data = { user: user };// данные для запроса
                            data = app.api("post", "users", data);
                            if (data.user) count++;// увеличиваем счётчик
                        };
                        delete users[login];
                    };
                };
                // возвращаем результат
                return count;
            },

            /**
             * Изменяет уже существующие задачи в сохранённом запросе.
             * @param {number} [query] - Идентификатор сохранённого запроса для всех проектов.
             * @param {string} fields - Изменяемые поля и их значения в формате id:value;id:value с шаблонизацией.
             * @param {string} [filters] - Дополнительный фильтр в формате id:value;id:value с шаблонизацией.
             * @returns {number} Количество изменённых задач.
             */

            "issues.change": function (query, fields, filters) {
                var key, value, filter, ids, keys, data, unit, flag, item, items,
                    count = 0, error = 0;

                // создаём необходимые объекты
                ids = {// преобразование идентификаторов
                    project: "project_id",
                    tracker: "tracker_id",
                    status: "status_id",
                    priority: "priority_id",
                    author: "author_id",
                    assigned: "assigned_to_id",
                    category: "category_id",
                    start: "start_date",
                    due: "due_date",
                    done: "done_ratio",
                    private: "is_private",
                    estimated: "estimated_hours",
                    version: "fixed_version_id",
                    parent: "parent_issue_id"
                };
                keys = {// преобразование ключей
                    start: "start_date",
                    due: "due_date",
                    done: "done_ratio",
                    private: "is_private",
                    estimated: "estimated_hours",
                    created: "created_on",
                    updated: "updated_on",
                    closed: "closed_on"
                };
                // получаем значения для изменяемых полей
                if (!error) {// если нету ошибок
                    fields = fields ? app.lib.str2obj(fields, false, app.val.delimKey, app.val.delimVal) : null;
                    if (fields) {// если удалось получить список полей и значения для их изменения
                        for (var id in fields) {// пробегаемся по списку полученных полей
                            value = fields[id].split('"').join("");
                            fields[id] = app.fun.str2val(value);
                        };
                    } else error = 1;
                };
                // получаем значения для фильтров
                if (!error) {// если нету ошибок
                    filters = filters ? app.lib.str2obj(filters, false, app.val.delimKey, app.val.delimVal) : null;
                    if (filters) {// если удалось получить список фильтров и значения для них
                        for (var id in filters) {// пробегаемся по списку полученных фильтров
                            value = filters[id].split('"').join("");
                            filters[id] = app.fun.str2val(value);
                        };
                    };
                };
                // получаем список задач в приложении
                if (!error) {// если нету ошибок
                    for (var items = [], data = null; !data || data.total_count > data.offset; data.offset += data.limit) {
                        data = { offset: data ? data.offset : 0 };// данные для запроса
                        if (query) data.query_id = query;// фильтр по идентификатору запроса
                        data = app.api("get", "issues", data);// запрашиваем данные через api
                        if (data.issues) items = items.concat(data.issues);
                    };
                };
                // выполняем действие над задачами
                for (var i = 0, iLen = items.length; !error && i < iLen; i++) {
                    item = items[i];// получаем очередной элимент
                    for (var key in item) {// пробигаемся по задаче
                        unit = item[key];// запоминаем значение
                        key = keys[key] ? keys[key] : null;
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
                                if (app.lib.validate(filter, "string")) {// если в фильтре строка
                                    filter = app.lib.template(filter, item);
                                };
                                flag = !app.lib.compare(value, filter);
                                if (!flag) {// если не прошёл проверку на полное соответствие
                                    filter = "" + filter;// приводим к единому типу
                                    value = "" + value;// приводим к единому типу
                                    filter = filter.toLowerCase();// переводим в нижний регистр
                                    flag = ~value.toLowerCase().indexOf(filter);
                                };
                            };
                            // прерываем если не прошли проверку
                            if (!flag) break;
                        };
                    };
                    // готовим данные для обновления
                    if (flag) {// если нужно подготовить данные
                        unit = null;// сбрасываем значение
                        for (var id in fields) {// пробегаемся по полям
                            value = fields[id];// получаем очередное значение
                            if (app.lib.validate(value, "string")) {// если в фильтре строка
                                value = app.lib.template(value, item);
                            };
                            id = ids[id] ? ids[id] : id;
                            if (!unit) unit = {};// создаём объект для данных
                            // присваиваем значения
                            if (!isNaN(id)) {// если дополнительное поле
                                if (!unit.custom_fields) unit.custom_fields = [];
                                unit.custom_fields.push({ id: id, value: value });
                            } else unit[id] = value;
                        };
                    };
                    // обновляем данные в заявке
                    if (flag) {// если необходимо обновить данные
                        data = { issue: unit };// данные для запроса
                        data = app.api("put", "issues/" + item.id, data);
                        if (data.issue) count++;// увеличиваем счётчик
                    };
                };
                // возвращаем результат
                return count;
            }
        },

        /**
         * Программный интерфейс взаимодействия с приложением.
         * @param {string} [method] - Метод http для запроса.
         * @param {string} request - Адрес uri запроса без расширения.
         * @param {object} [data] - Данные отправляемые в запросе.
         * @returns {object} Данные которые вернуло приложение.
         */

        api: function (method, request, data) {
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
                url = app.val.apiUrl + request + ".xml";
                head = {// заголовки запроса
                    "Cache-Control": "no-store",
                    "If-None-Match": "empty"
                };
                if (app.val.apiKey) {// если задан ключ для api
                    head["X-Redmine-API-Key"] = app.val.apiKey;
                };
                xhr = app.lib.sjax(method, url, head, data);
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
        init: function () {// функция инициализации приложения
            var value, key, flag, method, list = [], count = 0,
                index = 0, error = 0;

            // получаем адрес для запросов к api
            if (!error) {// если нету ошибок
                if (index < wsh.arguments.length) {// если передан параметр
                    value = wsh.arguments(index);// получаем очередное значени
                    if (value) {// если получено не пустое значение
                        key = "/";// обязательное окончание адреса для запросов 
                        flag = key != value.substr(value.length - key.length);
                        if (flag) value += key;// добавляем окончание
                        app.val.apiUrl = value;
                    } else error = 2;
                } else error = 1;
                index++;
            };
            // получаем ключ для запросов к api
            if (!error) {// если нету ошибок
                if (index < wsh.arguments.length) {// если передан параметр
                    value = wsh.arguments(index);// получаем очередное значени
                    if (value) {// если получено не пустое значение
                        app.val.apiKey = value;
                    } else error = 4;
                } else error = 3;
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
                count = method.apply(app, list);
            };
            // завершаем сценарий кодом
            value = error ? -1 * error : count;
            wsh.quit(value);
        }
    });
})(readmine, WSH);

// инициализируем приложение
readmine.init();