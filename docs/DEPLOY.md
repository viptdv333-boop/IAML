# Развёртывание сайта IAML на собственном сервере

Пошаговая инструкция «от нового VPS до работающего сайта с HTTPS и почтой». Рассчитана на владельца сайта без
опыта администрирования; специалисту (фрилансеру) её можно передать как техническое задание.
Время: 1–2 часа, из них основное — ожидание DNS и подтверждения домена в Resend.

**Что получится.** Один Linux-сервер, на котором в трёх Docker-контейнерах работают:

```
интернет ──443/80──> Caddy (HTTPS, сертификаты Let's Encrypt) ──> app (Node.js: сайт + API) ──> PostgreSQL
                                                                  └──> Resend (отправка писем по HTTPS API)
```

Единственный внешний сервис — **Resend** (почта). Никаких SaaS-баз данных и облачных хостингов. Все данные лежат на вашем
сервере; наружу открыты только порты 80 и 443 (и 22 для SSH).

> Все команды ниже выполняются на сервере по SSH, если не сказано иное. Команды, переменные и пути в блоках кода менять
> не нужно — меняйте только то, что указано словами `ВАШ_ДОМЕН`, `IP_СЕРВЕРА` и т. п.

## Краткая версия (для специалиста)

```bash
# чистый Ubuntu 24.04 / Debian 12, Docker Engine + compose-плагин установлены, A-запись домена указывает на сервер
sudo mkdir -p /opt/iaml && sudo chown "$USER":"$USER" /opt/iaml
git clone https://github.com/viptdv333-boop/IAML.git /opt/iaml && cd /opt/iaml
git config core.fileMode false && chmod +x deploy/*.sh
./deploy/gen-env.sh DOMAIN=ВАШ_ДОМЕН ACME_EMAIL=you@example.org      # создаёт .env с секретами
nano .env                                                             # RESEND_API_KEY=re_...  (домен подтверждён в Resend)
docker compose up -d --build
./deploy/create-admin.sh --email you@example.org --first Имя --last Фамилия
curl -fsS https://ВАШ_ДОМЕН/api/health
```

Дальше — подробно.

---

## Шаг 1. Закажите сервер (VPS) и домен

**Сервер.** Подойдёт любой VPS у любого провайдера:

| Параметр | Минимум | Комфортно |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| Память | 1 ГБ (+ swap 2 ГБ, см. ниже) | 2 ГБ |
| Диск | 20 ГБ SSD | 40 ГБ |
| ОС | Ubuntu 24.04 LTS (подойдёт 22.04 / Debian 12) | |
| Сеть | публичный IPv4, свободные порты 22, 80, 443 | |

Выбирайте дата-центр поближе к читателям сайта. Включите у провайдера автоматические снимки (snapshots) сервера, если
они недорогие — это дополнительная страховка к нашим бэкапам, но не замена им.

Если памяти 1 ГБ, сразу добавьте файл подкачки (защита от нехватки памяти при сборке образа):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Домен.** Нужен домен вида `iaml.org` и доступ к его DNS-записям (у регистратора или в панели DNS-хостинга). В примерах
ниже домен — `iaml.example.org`; подставляйте свой.

## Шаг 2. Настройте DNS

В панели DNS создайте запись типа **A**: имя `@` (сам домен) → **IP вашего сервера**. Если хотите, чтобы `www.домен`
тоже работал, добавьте вторую A-запись для `www` на тот же IP.

* AAAA-запись (IPv6) **не создавайте**: через Docker сайт увидит все IPv6-соединения как один адрес, и ограничения по
  частоте запросов будут общими для всех таких посетителей.
* Если у домена были другие A/AAAA/CNAME-записи на старый хостинг (например, на GitHub Pages) — удалите или замените их.
* Заранее (за сутки) уменьшите TTL записи до 300 секунд — переключение пройдёт быстрее.

Проверка (с вашего компьютера; подождите 5–30 минут, пока DNS обновится):

```bash
dig +short iaml.example.org        # должен вывести IP вашего сервера
```

Без работающей DNS-записи Caddy не сможет получить сертификат — не переходите к шагу 8, пока проверка не пройдёт.

## Шаг 3. Первый вход и защита сервера

Подключитесь под `root` (данные есть в письме или панели провайдера):

```bash
ssh root@IP_СЕРВЕРА
```

**3.1. Обновления и отдельный пользователь.** Работать под `root` не стоит. Создадим пользователя `deploy`:

```bash
apt-get update && apt-get -y upgrade
adduser deploy                    # придумайте пароль, остальные вопросы — Enter
usermod -aG sudo deploy
ls /var/run/reboot-required       # если файл есть, после обновления нужна перезагрузка: выполните reboot и войдите снова
```

**3.2. Вход по SSH-ключу.** На вашем компьютере создайте ключ (если его ещё нет) и скопируйте на сервер:

```bash
ssh-keygen -t ed25519             # Linux / macOS / Windows PowerShell; задайте парольную фразу
ssh-copy-id deploy@IP_СЕРВЕРА     # Linux / macOS / Git Bash
```

В Windows PowerShell вместо `ssh-copy-id`:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@IP_СЕРВЕРА "install -d -m 700 -o deploy -g deploy /home/deploy/.ssh && cat >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys"
```

Если провайдер при создании сервера уже положил ваш ключ для `root`, на сервере достаточно:

```bash
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ \
  && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

**Откройте второе окно терминала и убедитесь, что `ssh deploy@IP_СЕРВЕРА` входит без пароля сервера** (спросить может только
парольную фразу ключа). Только после этого отключайте вход по паролю и вход под root:

```bash
sudo tee /etc/ssh/sshd_config.d/00-iaml-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl reload ssh
```

(Файл называется `00-…`, чтобы настройки применились раньше возможных файлов провайдера вроде `50-cloud-init.conf`.)

**3.3. Брандмауэр.** Разрешаем только SSH, HTTP и HTTPS (UDP 443 — для HTTP/3):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22,80,443/tcp
sudo ufw allow 443/udp
sudo ufw enable                   # ответьте y
sudo ufw status
```

Если SSH у вас на нестандартном порту — сначала разрешите именно его, иначе потеряете доступ. Помните: Docker сам
открывает опубликованные порты в обход ufw, поэтому **никогда не публикуйте порты базы данных** (в нашем
`docker-compose.yml` наружу смотрит только Caddy).

**3.4. Автоматические обновления безопасности:**

```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades     # ответьте Yes
```

(На Ubuntu пакет обычно уже установлен и включён.) Дальше работаем как `deploy`: `ssh deploy@IP_СЕРВЕРА`.

## Шаг 4. Установите Docker Engine и Compose

Официальный способ из репозитория Docker (для Ubuntu; для Debian замените `ubuntu` на `debian` в двух адресах `https://download.docker.com/linux/…`):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Выйдите и войдите снова (`exit`, затем `ssh deploy@IP_СЕРВЕРА`), чтобы группа `docker` подействовала, и проверьте:

```bash
docker --version
docker compose version             # должна быть версия v2.x (подойдёт любая актуальная)
```

Docker запускается вместе с сервером, а контейнеры сайта имеют `restart: unless-stopped` — после перезагрузки сервера
сайт поднимется сам.

## Шаг 5. Скачайте репозиторий

```bash
sudo mkdir -p /opt/iaml && sudo chown "$USER":"$USER" /opt/iaml
git clone https://github.com/viptdv333-boop/IAML.git /opt/iaml
cd /opt/iaml
git config core.fileMode false     # смена прав доступа не считается «изменением файлов» (иначе update.sh откажется работать)
chmod +x deploy/*.sh               # делает скрипты исполняемыми (если они уже такие — ничего не изменится)
```

Серверная часть находится в ветке `main`. Если на момент установки она ещё не слита в `main`, выполните
`git checkout backend`. **Все следующие команды выполняйте из каталога `/opt/iaml`** — там лежит `docker-compose.yml`.

## Шаг 6. Создайте файл настроек `.env`

Все настройки и секреты хранятся в одном файле `/opt/iaml/.env`. Он **не попадает в git** (репозиторий публичный) и не
входит в бэкапы. Создаётся одной командой, секреты генерируются автоматически:

```bash
./deploy/gen-env.sh DOMAIN=iaml.example.org ACME_EMAIL=you@example.org
```

* `DOMAIN` — домен сайта без `https://`.
* `ACME_EMAIL` — ваш настоящий e-mail: на него Let's Encrypt пришлёт предупреждение, если сертификат не удастся продлить.
* `POSTGRES_PASSWORD` и `SESSION_SECRET` скрипт генерирует сам (`openssl rand`); существующий `.env` он не перезаписывает.
* `MAIL_FROM` скрипт заполняет значением `IAML <no-reply@ВАШ_ДОМЕН>`; поправьте после шага 7, если письма будут уходить
  с другого (подтверждённого в Resend) домена.

Откройте файл и впишите ключ Resend (получите его на следующем шаге):

```bash
nano .env           # сохранить: Ctrl+O, Enter; выйти: Ctrl+X
```

**Сохраните копию `.env` в менеджере паролей.** Без `POSTGRES_PASSWORD` из этого файла восстановить базу на новом сервере
из бэкапа можно, но придётся задавать новые секреты; потеря `SESSION_SECRET` делает недействительными ссылки «отписаться»
в уже разосланных письмах.

Что можно настроить (всё, кроме первых шести переменных, — необязательно; полный список с комментариями — `deploy/.env.example`):

| Переменная | Назначение |
|---|---|
| `DOMAIN` | домен сайта. Обязательно |
| `ACME_EMAIL` | e-mail для Let's Encrypt. Обязательно |
| `POSTGRES_PASSWORD` | пароль базы (латиница и цифры). Генерируется. Обязательно |
| `SESSION_SECRET` | секрет подписи кодов и ссылок отписки, не короче 32 символов. Генерируется. Обязательно |
| `RESEND_API_KEY` | ключ Resend (`re_…`). Обязательно |
| `MAIL_FROM` | адрес отправителя, например `'IAML <no-reply@iaml.example.org>'` (в одинарных кавычках). Обязательно |
| `SITE_URL` | публичный адрес сайта. По умолчанию `https://ДОМЕН` — обычно задавать не нужно |
| `WWW_HOST` | `www.ВАШ_ДОМЕН` — включает перенаправление www → домен (нужна A-запись для www) |
| `SITE_TZ`, `DIGEST_HOUR`, `DIGEST_WEEKDAY` | часовой пояс (по умолчанию UTC+3), час и день недели рассылок Mongolist |
| `MAIL_MIN_INTERVAL_MS` | пауза между письмами, мс (по умолчанию 600) |
| `LOG_LEVEL` | `info` (по умолчанию), `debug`, `warn`, `error` |

После любого изменения `.env` выполните `docker compose up -d` — изменённые контейнеры пересоздадутся.

## Шаг 7. Настройте Resend (отправка писем)

Сайт отправляет письма с кодами подтверждения, сообщения из формы контактов и рассылки Mongolist через сервис Resend
(HTTP API; на бесплатном тарифе — до 3 000 писем в месяц и 100 в день). Без этого шага регистрация участников работать
не будет: код подтверждения просто не дойдёт.

1. Зарегистрируйтесь на <https://resend.com> и подтвердите e-mail.
2. **Domains → Add Domain.** Введите домен, с которого будут уходить письма. Лучше использовать поддомен
   (например, `mail.iaml.example.org`): так SPF-запись Resend не пересечётся с почтой самого домена, если она у вас есть.
   Регион выберите ближайший к вашим читателям.
3. Resend покажет DNS-записи, которые нужно добавить. Обычно это три записи: **DKIM** (TXT `resend._domainkey`),
   **SPF** (TXT) и **MX для возвратного адреса** (поддомен `send`). Скопируйте имя, тип и значение каждой записи **без
   изменений** в DNS-панель вашего регистратора. Если DNS-панель Cloudflare — отключите «проксирование» (оранжевое облако)
   для этих записей.
4. Нажмите **Verify DNS Records**. Обычно подтверждение занимает 15 минут, иногда до суток и более. Нужен статус
   **Verified**.
5. Рекомендуется добавить DMARC: TXT-запись `_dmarc.ВАШ_ДОМЕН` со значением `v=DMARC1; p=none;`.
6. **API Keys → Create API Key.** Название — например, `iaml-server`; **Permission: Sending access**; домен — тот, что вы
   подтвердили в пункте 4. Скопируйте ключ (`re_…`): Resend показывает его **только один раз**.
7. Впишите в `.env`:

   ```
   RESEND_API_KEY=re_ваш_ключ
   MAIL_FROM='IAML <no-reply@mail.iaml.example.org>'
   ```

   Адрес в `MAIL_FROM` должен быть **на подтверждённом домене**. Ящик `no-reply@…` создавать не нужно — он только указывает
   отправителя. Ответы читателей на письма из формы контактов уходят автору сообщения (Reply-To).

Важно знать:

* Сайт **только отправляет** письма. Ящики вроде `info@iaml.org`, на которые люди пишут вам, нужно завести отдельно (почтовый
  хостинг или пересылка у регистратора). Адреса, которые показываются на странице Contacts, настраиваются в админке (шаг 10).
* Бесплатный лимит — 100 писем в сутки. Если рассылки Mongolist разойдутся на сотни подписчиков, упрётесь в него:
  приложение не теряет письма (они ждут в очереди и повторяются), но дойдут с задержкой; тогда выберите платный тариф.
  Приложение шлёт письма по одному с паузой `MAIL_MIN_INTERVAL_MS` (600 мс ≈ 1,6 запроса в секунду), чтобы укладываться в лимит
  частоты запросов API. Актуальные лимиты — на странице тарифов Resend.
* Если письма не доходят — смотрите «Где искать ошибки почты» в разделе «Если что-то не работает» ниже.

## Шаг 8. Запустите сайт

```bash
cd /opt/iaml
docker compose up -d --build
```

Первая сборка занимает 2–5 минут (скачиваются образы, ставятся зависимости). Если какая-то обязательная переменная в `.env`
пуста, `docker compose` остановится и назовёт её.

```bash
docker compose ps                  # db и app: healthy, caddy: running
./deploy/logs.sh caddy             # Ctrl+C для выхода
```

В логах Caddy ищите строку `certificate obtained successfully` — это выпущен сертификат Let's Encrypt (занимает
до минуты). Откройте `https://ВАШ_ДОМЕН` в браузере: должен появиться замок.

При первом запуске приложение само создаёт таблицы базы данных (миграции) и один раз загружает начальные данные
(список участников, меню, категории ссылок). Повторные запуски эти данные не затрагивают и не возвращают то, что вы удалили
в админке.

## Шаг 9. Создайте первого администратора

```bash
./deploy/create-admin.sh --email you@example.org --first Имя --last Фамилия
```

Скрипт выведет **случайный пароль — один раз**. Войдите на `https://ВАШ_ДОМЕН/admin.html` и сразу смените пароль на
странице аккаунта. Другим людям права администратора выдаются тем же скриптом (учётная запись, которая уже
существует, будет повышена до администратора) или в админке, в разделе пользователей.

Забыли пароль администратора: `./deploy/create-admin.sh --email you@example.org --password 'новый-пароль'` — для существующей
учётной записи пароль будет заменён (пароль в командной строке остаётся в истории оболочки; смените его после входа).

## Шаг 10. Чек-лист первого запуска

- [ ] `https://ВАШ_ДОМЕН` открывается, в адресной строке замок; `http://ВАШ_ДОМЕН` перенаправляет на `https://`.
- [ ] `https://ВАШ_ДОМЕН/api/health` отвечает `{"ok":true,…}`.
- [ ] Регистрация нового участника на сайте: на e-mail приходит письмо с 6-значным кодом (проверьте и «Спам»), код принимается,
      участник входит в аккаунт.
- [ ] Вход администратора на `/admin.html` работает; пароль заменён на свой.
- [ ] В админке заменены **контактные e-mail** и адрес организации (страница Contacts): люди на странице контактов, получатели
      формы обратной связи, общий адрес `contact.email` и адрес `contact.address` в настройках. Если получатели формы не заданы,
      сообщения уходят всем администраторам.
- [ ] Тестовое сообщение через форму контактов дошло до получателей и появилось во входящих админки.
- [ ] В админке, раздел **Mail queue** (очередь почты): все письма в статусе `sent`, нет `failed`.
- [ ] Сделан первый бэкап `./deploy/backup.sh`, настроен ночной запуск по cron и копирование бэкапов за пределы сервера
      (`docs/OPERATIONS.md`).
- [ ] Настроена внешняя проверка доступности `https://ВАШ_ДОМЕН/api/health` (`docs/OPERATIONS.md`, «Мониторинг»).
- [ ] Файл `.env` сохранён в менеджере паролей.

## Шаг 11. Переход с черновика на GitHub Pages на настоящий домен

Черновик на GitHub Pages (`https://viptdv333-boop.github.io/IAML/`) — это только статические страницы без серверной части.
Страницы умеют работать в двух режимах: пока `/api/health` не отвечает (GitHub Pages, офлайн, открытие файла с диска), они
показывают встроенное статическое содержимое; на сервере с API они подгружают живые данные. Поэтому черновик можно оставить
как есть, пока вы не будете готовы.

Что меняется при переходе на домен:

1. **DNS.** Если домен был привязан к GitHub Pages (в репозитории Settings → Pages указан Custom domain / есть файл `CNAME`),
   уберите эту привязку и замените DNS-записи на A-запись нового сервера (шаг 2).
2. **`.env`.** Достаточно `DOMAIN` (адрес сайта `SITE_URL` берётся из него: `https://ДОМЕН`). Если вы позже смените домен — поменяйте
   `DOMAIN` (и `MAIL_FROM`, если отправка идёт с этого домена, а домен подтвердите в Resend), затем `docker compose up -d`;
   сертификат для нового имени Caddy выпустит сам. Адрес в браузере обязан совпадать с `SITE_URL`, иначе формы будут
   отвечать ошибкой `403 csrf`.
3. **`robots.txt`, `sitemap.xml`, `site.webmanifest`** формируются сервером автоматически из `SITE_URL` — файлы `robots.txt`
   и `sitemap.xml` из репозитория (они содержат адрес GitHub Pages) на сервере **не используются** и править их не нужно.
4. **Адреса в HTML.** В страницах могут остаться «зашитые» адреса черновика (`canonical`, `og:url`). Найдите их командой
   `grep -rn "github.io" *.html assets/` и замените на ваш домен в репозитории, затем `./deploy/update.sh`.
5. **Поисковики.** После переключения добавьте сайт в Google Search Console / Яндекс Вебмастер и укажите `https://ВАШ_ДОМЕН/sitemap.xml`.
6. **Письма.** Ссылки в письмах строятся по `SITE_URL` в момент отправки; письма, отправленные до смены домена, ведут на старый адрес.

## Шаг 12. Локальная проверка (без сервера и домена)

Для разработчика или фрилансера: весь стек можно поднять на своём компьютере с Docker (нужен достаточно свежий Docker
Compose: от 2.24, проверено на 5.0.2). Используется отдельное имя проекта `iaml-deploytest` и порт `18080`, обычный HTTP, без
сертификатов; письма не отправляются, а складываются в таблицу `mail_outbox` (коды подтверждения видны в теме письма).

```bash
./deploy/gen-env.sh --local                 # создаст deploy/local.env с одноразовыми секретами (в git не попадает)
docker compose --env-file deploy/local.env -f docker-compose.yml -f docker-compose.local.yml up -d --build
curl http://localhost:18080/api/health

# вспомогательные скрипты работают с этим же стендом, если заранее задать переменные Compose
# (в Windows Git Bash добавьте COMPOSE_PATH_SEPARATOR=:)
export COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml COMPOSE_ENV_FILES=deploy/local.env
./deploy/create-admin.sh --email admin@example.org --first Ada --last Admin
./deploy/backup.sh

# письма с кодами:
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select to_email, subject from mail_outbox order by id desc limit 5"'

# удалить стенд целиком (контейнеры, сеть и тома — только локальный стенд!):
docker compose --env-file deploy/local.env -f docker-compose.yml -f docker-compose.local.yml down -v --remove-orphans
```

---

## Если что-то не работает

Сначала посмотрите состояние и журналы: `./deploy/status.sh`, `./deploy/logs.sh app`, `./deploy/logs.sh caddy`
(выход — Ctrl+C; `--no-follow` — показать и выйти).

| Что видите | Вероятная причина | Что делать |
|---|---|---|
| `docker compose up` пишет `required variable … is missing a value` | в `.env` пуста обязательная переменная | заполните её (`nano .env`), повторите команду |
| `permission denied … /var/run/docker.sock` | пользователь не в группе `docker` | `sudo usermod -aG docker "$USER"`, выйдите и войдите снова |
| `Permission denied` при запуске `./deploy/….sh` | у файла нет бита исполнения | `chmod +x deploy/*.sh` или `bash deploy/скрипт.sh` |
| `address already in use` для порта 80 или 443 | порт занят другим веб-сервером (apache, nginx) | `sudo ss -ltnp \| grep -E ':80\b\|:443\b'`; остановите и отключите мешающий сервис |
| Браузер: «соединение не защищено» / `ERR_SSL_PROTOCOL_ERROR` | сертификат ещё не выпущен или выпуск не удался | `./deploy/logs.sh caddy`. Частые причины: A-запись не указывает на сервер (`dig +short ДОМЕН`), закрыты порты 80/443 (ufw, панель провайдера), опечатка в `DOMAIN`, превышен лимит Let's Encrypt (5 неудачных попыток в час) — подождите час |
| Страница «The site is restarting» или `502 Bad Gateway` | приложение не запущено или нездорово | `docker compose ps`, затем `./deploy/logs.sh app` |
| Контейнер `app` постоянно перезапускается, в логе `Invalid configuration:` | ошибка в `.env` (перечислены все проблемы; код выхода 78) | исправьте указанные переменные, `docker compose up -d` |
| В логе `app`: `password authentication failed for user "iaml"` | пароль базы в `.env` изменили после первого запуска (PostgreSQL запоминает пароль один раз) | верните прежнее значение либо смените пароль внутри базы — `docs/OPERATIONS.md`, «Смена пароля базы данных» |
| В логе `app`: `TypeError: Invalid URL` | в `POSTGRES_PASSWORD` есть символы `@ : / # ? %` | допустимы только латинские буквы и цифры |
| Формы и вход отвечают `403 csrf` | адрес в браузере не совпадает с `SITE_URL` (http вместо https, `www.` вместо домена) | откройте сайт по адресу из `DOMAIN`; включите перенаправление `WWW_HOST` |
| Сайт открывается, но остаётся «статическим» (нет живых данных, нет входа) | `/api/health` не отвечает JSON-ом `{"ok":true}` | `curl -i https://ДОМЕН/api/health`; `docker compose ps`; посмотрите консоль браузера |
| Письма не приходят | см. ниже «Где искать ошибки почты» | |
| Аватарки пропали | удалён том `iaml_uploads` (например, `docker compose down -v`) | восстановите из бэкапа: `docs/OPERATIONS.md`. Никогда не используйте `down -v` на рабочем сервере |
| Закончилось место на диске | журналы Docker, образы, бэкапы | `docker system df`, `du -sh /opt/iaml/backups`; `docker builder prune` и `docker image prune` освободят старые образы; журналы уже ротируются (5 × 10 МБ на контейнер) |
| Контейнеры не поднялись после перезагрузки сервера | служба Docker выключена | `sudo systemctl enable --now docker`; затем `docker compose up -d` |

**Где искать ошибки почты.**

1. Админка → раздел **Mail queue**: у каждого письма виден статус (`queued`, `sent`, `failed`) и текст последней ошибки
   (`last_error`). Письма можно отправить повторно.
2. `./deploy/logs.sh app --since 1h --no-follow | grep -i -E "resend|mail"`.
3. Панель Resend → Emails / Logs: видно, дошло ли письмо до Resend и что с ним случилось.

Типичные ошибки в `last_error`:

| Сообщение | Причина |
|---|---|
| `Resend refused (403 …)` / «domain is not verified» | домен отправителя не подтверждён в Resend или `MAIL_FROM` указывает на другой домен |
| `Resend refused (401 …)` | неверный или удалённый `RESEND_API_KEY` |
| `rate limited by Resend (… quota …)` | исчерпан дневной (100) или месячный (3 000) лимит бесплатного тарифа; письма повторятся автоматически |
| `network error` | с сервера нет выхода в интернет к `api.resend.com` (DNS, фаервол провайдера) |
| письма «отправлены», но не в почтовом ящике | проверьте «Спам»; настройте SPF/DKIM/DMARC (шаг 7) |
| в очереди письма имеют статус `sent`, а в панели Resend пусто | в `.env` задано `MAIL_TRANSPORT=log` (режим разработки: письма никуда не уходят) — удалите эту строку и выполните `docker compose up -d` |

Дальше: повседневная эксплуатация — обновления, бэкапы, мониторинг, смена секретов — в [`docs/OPERATIONS.md`](OPERATIONS.md).
