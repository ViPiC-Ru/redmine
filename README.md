# ��������
`JScript` ��� �������������� � [Redmine](http://www.redmine.org/) �� ��������� `REST API` � `WSH` ����� ������������ ������� **Windows**. � ������ ������� ������ ������������ ��� ������������� � ������������ �����. � ������� ������� ����� ������������ ������������� ������������� � **Active Directory** ����� `LDAP` � �������������� ��������� (��������) �����. ��� �������������� � **Redmine** ������������ `XML` ������.
# �������������
� ��������� ������ **Windows** ������� ��������� �������:
```bat
cscript redmine.min.js <instance> <method> [... <param>]
```
- `<instance>` - ����� ��� ����������� � **Redmine** ����� **REST API** � ������� **url**. ���� � ����� �� ����������, �� ����������� �������������. ����� ������� ����� � ������  ��� **Basic Authentication** ��� ���� ������� �� ��������� ����� `#`. ��� �������� **REST API** � ���������� ���� ������������ ��� �������������� ������� � [����������� ������������](http://www.redmine.org/projects/redmine/wiki/Rest_api).
- `<method>` - ��� ������������ ������, ������� ����� ���������.
- ... `<param>` - ��������� ��� ������.
## ����������� ������
`users.sync` - ������������� ������������� � **Active Directory** ����� **LDAP**. ����� ��������� ������ � ������������� **Redmine**, �������� ����������� ������������� � �������� �����. ������������ **Redmine**, � ������� ��� ��������������� ������������� � ���������� **Active Directory**, �� ���������. ������������ �������������� �� ������� ���� � �������� ���������������� ������ �����. ����������� � **Active Directory** ��� � ��������� �������� ������������, ������� ��� ������� ������� �� ������������ ����� �� �������� ������� �� ����� ������ ������������ ��������� ������.
```bat
cscript redmine.min.js <instance> users.sync <source> <fields> [<auth>]
```
- `<source>` - ����� ��� ����������� � **Active Directory** � ������� **url** (�������������� �������� `ldap`). ����� ������� **GUID**, **cn**, **distinguishedName**, **sAMAccountName** ��� **LDAP-SQL** ������ � ������������� � ����������� `{select}`, `{scheme}`, `{parent}`. � �������� **LDAP-SQL** ������� ����� ������� ����� ������� ������� � `WHERE`.
- `<fields>` - ������������ **��������������** ���� ������������ � ��� �������� � ������� `ID:value;id:value` � ���������� ������������ ������������ �������������� �� ������� ���� � ���� ������. ���� � �������� ���� ���������� �������, �� ��� �������� ����� ��������� � ������� �������. ��� **������������� �����** ������������� ������� ������������� ���� � ���� �����. 
- `<auth>` - ������������� ������ �������������� � ����������. �������������� ����� ���������� �� �������� **������ ��������������** *(����������������� - ����������� � ������� LDAP)* � **Redmine**.

`issues.sync` - ������������� ����� � **Cherwell**. �������������� �������������� ����������.
```bat
cscript redmine.min.js <instance> issues.sync <destination> <query> [<filters>] <fields>
```
- `<destination>` - ����� ��� ����������� � **Cherwell** ����� **REST API** � ������� **url**. ���� � ����� �� ����������, �� ����������� �������������. ����� ������� �����, ������ � ������������� ������� �� ��������� ����� `#`. ��������� ����� ��������� � [����������� ������������](https://help.ivanti.com/ch/help/en_US/CSM/2023/documentation_bundle/LandingPage.htm).
- `<query>` - ������������� ������������ ������� ��� ���� ��������. ������� ����� �������� �� �������� **������** � **Redmine**. ������� ��������� � ������ ����� � ����������� **����������� �������** � **��� ����������� �������**. ������ ������ ���� ����� ��-��� ������������, ������� ������������ ��� �������������� � **REST API**. � ���������� ������� ����������� ������ ������ ������� **��� ���� ��������**. ������������� ������� � **Redmine** ������ ��������� � ������ ������� � **Cherwell** � ������������ ������������, ������� ������������ ��� �������������� � **REST API**.
- `<filters>` - �������������� ������ ��� ����� � ������� `id:value,value;id:value,value` � ���������� ������������. ���� � �������� ���� ���������� �������, �� ��� �������� ����� ��������� � ������� �������. ����� ������� ��������� ���������� �������� ����� �������.
- `<fields>` - ������������ **��������������** ���� ������ � **Cherwell** � ��� �������� � ������� `ID:value;id:value` � ���������� ������������ ������ � ������ �������������� �� ������� ���� � ���� ������. ���� � �������� ���� ���������� �������, �� ��� �������� ����� ��������� � ������� �������.

`issues.change` - ��������� �����. ����� �������� ������ � �������� �����. �������������� �������������� ����������.
```bat
cscript redmine.min.js <instance> issues.change [<query>] [<filters>] <fields>
```
- `<query>` - ������������� ������������ ������� ��� ���� ��������. ������� ����� �������� �� �������� **������** � **Redmine**. ������� ��������� � ������ ����� � ����������� **����������� �������** � **��� ����������� �������**. ������ ������ ���� ����� ��-��� ������������, ������� ������������ ��� �������������� � **REST API**. � ���������� ������� ����������� ������ ������ ������� **��� ���� ��������**.
- `<filters>` - �������������� ������ ��� ����� � ������� `id:value,value;id:value,value` � ���������� ������������. ���� � �������� ���� ���������� �������, �� ��� �������� ����� ��������� � ������� �������. ����� ������� ��������� ���������� �������� ����� �������.
- `<fields>` - ���� � �� �������� � ������� `id:value;id:value` � ���������� ������������. ���� � �������� ���� ���������� �������, �� ��� �������� ����� ��������� � ������� �������. ��� **������������� �����** ������ ������� ������������� ���� � ���� �����.

## ������������
� **����������** � **���������**, ������� ������������ ������������, ����� ��������� �������. **������** �� ���� ������������ ������, ������� ����� ��������� *(� ����� � �� ���������)* ���� ��� ��������� ������������ `|`. **�����������** ����� ������ �� ���������. � **���������** ������ ����� ����������� *(� ����� � �� �����������)* ���� ��� ��������� ���������� �� ��������. **���������** �� �������� `{object.key.id>filter(param)}` ������������ �� ���� ������������������ ������, �� ������� ����� ������ � ������� ����� �������� ��������. ���� **��������** �����������, �� **��������** ��������� *(��� �������� ��������� �������� ������ ������ �������������, � �� ���� ������)*. � �������� **�������** ������������ ��������, � ������� �������� ������. ���� ����� �������� �������� �����������, �� ��������� ����������� ��� ���� ������.
```
"����� ��� �������|| {author.name} ������� {project.name>normal}| {done_ratio} %|."
```
� **����������** �� �������� ����� ��������� ������������������ **��������** ��� ��������� ��������. ������� ����� ��������� �������������� **���������** � ������� ������� ����� �������. ������ �� ����������� ���� �������������� ��������� �� ����������. �������������� ��������� �������:
- `hash` - ��������� ������ ����� ��������, ������� ��� ����� ������� `#`.
- `set` - ���������� ������ `true` ���� �������� �� ������ ��������, � ��������� ������ `false`.
    - `<true>` - ������������ ����� ������ ������ `true`. ���� ������ ������ ������, �� ����� ���������� �������� ����������� � ������.
    - `<false>` - ������������ ����� ������ ������ `false`. ���� ������ ������ ������, �� ������ �� ������������.
- `map` - �������� �������� �� ��������������� ���������� �����. ���� ������������ �� �������, �� ������ �� ������������.
    - `<relation>` - �������� � � ������ � ������� `id=value`. ����� ������� ��������� ����� ������ ����� �������.
- `phone` - ��������� �������� ��� ���������� ����� � ������� `+X (XXX) XXX-XX-XX`.
- `journal` - �������� ������������� ������������, ���������� ��������� ���������. ����� ������ ������� � ��������.
- `user`, `issue`, `project` - �������� �� �������� ��������������� ������ ��� �������� ��� ��������.
- `normal` - ������ ������ ������ ��������� � ������� �����, ��������������� � �������������� ���� � �����, ���� �� ������������. ��� �� ������� `FW:` � `RE:` � ������ ��������.
# ������� �������������
���������������� ������������� �� ���������� **Active Directory** � **GUID** `{8F640E75-C072-47CA-5DBD-66AFC5D7E38F}` � ���������� **Redmine** ������������� �� ������ https://redmine.org ��������� **���� �������** ������������ `8dbfd7b0a9c9279a97fedfb82710aed96bcf53fc`. � **������������� �����** � ��������������� **12** �������� **������� ������������** ������������. ������� **����� ��������������** ��� **1**.
```bat
cscript redmine.min.js https://redmine.org#8dbfd7b0a9c9279a97fedfb82710aed96bcf53fc users.sync ldap://{8F640E75-C072-47CA-5DBD-66AFC5D7E38F}
login:{sAMAccountName};firstname:{givenName};lastname:{sn};mail:{mail};12:"{manager.sAMAccountName>user.lastname}" 1
```
���������������� ������ �� ���������� **Redmine**, �������������� �� ������ https://redmine.org ��������� **���� �������**, � ������ � **Cherwell**, �������������� �� ������ https://ivanti.com/CherwellAPI ��������� **�����** � **������**. ��� ������������� ������������ **����������� ������** � ��������������� **39**, � ����� �������� ���� � ������������������ ����������, � ����������� �������� � ��������������� �����������.
�������� ������������� **�������** �� **8**, ������� **����������** �� **10** � �������� **�����������** � ������������� ��� ����� �� **������������ �������** � ��������������� **46**, ���� **��������** ������ �������� `������`, **������������� ����** � ��������������� **10** �������� `�����`, ��� **�� ���������** ������ � ������ ��������� ������. ��� ����������� � ���������� **Redmine** ������������ **�����** `user` � **������** `password`.
```bat
cscript redmine.min.js https://redmine.org#8dbfd7b0a9c9279a97fedfb82710aed96bcf53fc issues.sync https://user:password@ivanti.com/CherwellAPI#27f5c613-4392-c534-6fe9-ed646fe9ed64 39 SuppliersReference:{id};ServiceCountryCode:RUS;Description:"{description>set(,'��� ��������')}";CustomerDisplayName:"{author.id>user[15]}";Status:"{status.id>map(3=Resolved,4=Resolved)}";OwnedBy:"{assigned_to.id>user[15]}"
```
�������� ������������� **�������** �� **8**, ������� **����������** �� **10** � �������� **�����������** � ������������� ��� ����� �� **������������ �������** � ��������������� **46**, ���� **��������** ������ �������� `������`, **������������� ����** � ��������������� **10** �������� `�����`, ��� **�� ���������** ������ � ������ ��������� ������. ��� ����������� � ���������� **Redmine** ������������ **�����** `user` � **������** `password`.
```bat
cscript redmine.min.js https://user:password@redmine.org issues.change
46 description:������;10:�����;is_private:true;assigned_to.id:{author.id} status.id:8;done_ratio:10;notes:"{author.name}, ���� ������ ������������� ���������������� � �������."
```