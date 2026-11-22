# Адаптер браузерного розширення для Extra Magazin (`extramagazin.es`)

Дата: 2026-11-22
Статус: затверджено 2026-11-22
Spec-review: codex/gpt-6.1-sol @ e5eb983 (author: agy) — 3 findings: 3 fixed, 0 rejected

## Для власника

**Мета.** Користувачі розширення бачать свій статус Untappd («вже пив» + особисту оцінку або глобальний рейтинг) на сторінках іспанського магазину `extramagazin.es` усіма шістьма підтримуваними мовами (`/`, `/uk/`, `/pl/`, `/ca/`, `/ru/`, `/ro/`), включно з розділами пива, сидру, медовухи, радлера та квасу — без потрапляння продуктів харчування, комбучі, кефіру, вина чи міцного алкоголю в пошук, без хибного червоного `✕` на незнайомих картках, і з видимим попередженням «Не змогли розібрати цю картку» для розпізнаних напоїв із порожньою після чищення назвою (наприклад `Пиво 500 мл`).

**Що зміниться для тебе.** Розширення отримує новий host permission для `https://extramagazin.es/*` та `https://*.extramagazin.es/*`. Через новий host permission наступний реліз потребуватиме ручного завантаження zip-пакета в Chrome Web Store (як задокументовано в `docs/extension-release.md`), а сама зміна на сервер нічого не додає і версію розширення не піднімає.

**На чому стоїть рішення.**
- Вітрина працює на PrestaShop SSR із шістьма мовними префіксами (`/`, `/uk/`, `/pl/`, `/ca/`, `/ru/`, `/ro/`; `/en/` дає 404), де товарні й категорійні URL-слаги лишаються незмінними іспанською в усіх мовах `[проба]` (§Проби, 1).
- Назви товарів магазин перекладає мовою інтерфейсу (`"ЧОРНЕ"`, `"NEGRO"`, `"KOZEL CIEMNE"` для `Kozel Černý / Dark`) або підміняє броварню на дистриб'ютора/заглушку (`"Marcas variadas"`, `"ZYWIEC"` для Namysłów, `"KAYAKI"` для Квасу Тарас), тож без нормалізації за слагом (із збереженим ABV сорту) та словником брендів локалізовані картки падають у промах або сирітство `[проба]` (§Проби, 2).
- `extramagazin.es` — це загальний продуктовий супермаркет, тому на змішаних сторінках (`/`, `/novedades`, `/ofertas`, `/brands/*`, `/search`) більшість карток — їжа чи напої без пивної ідентичності; за `spec.md` §6 червоний `✕` дозволено ставити лише за позитивною ознакою не-пива, а решту треба тихо пропускати `[вимога власника]`.
- Прямі HTTP-запити (`curl`) до `extramagazin.es` перехоплює Bunny Shield Proof-of-Work challenge, тому фікстуру `extramagazin.html` знято з живого DOM після проходження перевірки у браузері, зберігши реальну структуру PrestaShop (`<head>` з `hreflang` та JSON-LD `ItemList`, навігацію `#left-column`, контейнер `#js-product-list` і всі 24 картки першої сторінки `/uk/cerveza`) без важких скриптів теми/аналітики `[проба]` (§Проби, 3).

**Ключові рішення.**
1. `isNonBeerPage(url)` як чорний список відомих не-пивних харчових/алкогольних категорій і product-slug — відкинуто білий список, бо він блокував промо-сторінки `/ofertas`, шлях пагінації `/cerveza/2`, медовуху `/hidromiel` та пивні товари без префікса `cerveza-`.
2. Позитивна класифікація `nonBeer: true` лише за `isNonBeerName`, відомим не-пивним слагом або `isNonAlcoholicSoftDrinkFamily`, тихий пропуск (`continue`) для некласифікованих карток і видиме попередження `skipReason: 'unparsed'` («Не змогли розібрати цю картку») для впізнаного напою з порожньою назвою — відкинуто `else → nonBeer: true` і тихий `continue` після порожнього парсу.
3. `NORMALIZED_SLUG_OVERRIDES` на клієнті з очищенням фасування, об'єму й тари (`productKey(href)`), але **зі збереженням ABV у ключі**, — розглянуто стандартне: перенести всі 26 пар у серверну таблицю `ALIAS_PAIRS` або прибрати ABV із ключа — перше відкинуто, бо серверний `ALIAS_PAIRS` поєднує лише назви броварень, а друге відкинуто, бо зрізання ABV зливало 0.0% та алкогольні варіанти одного бренду (напр. `Łomża 0.0%` і `Łomża 5.0%`).
4. `bebida fermentada` допускається до категорії квасу лише разом із токеном `kvas` — комбуча й кефір більше не стають квасом.

**Що стане гірше.** Нова не-пивна продуктова категорія з несподіваним шляхом (поза чорним списком) відкриє overlay і пропустить картки на рівні `parseCards` (тихо, без запитів у `/match`), а товар перекладеного бренду з новими сортами або новим ABV без slug-override піде в загальний `/match`.

**Оцінка.** Власник: S. Автор: S — адаптер (~45%), фікстури та тести (~35%), документація/спека/скріншоти popup (~20%).

**Питання до власника.** Немає.

## Тіло

### Проби

1. **Живий браузер на `https://extramagazin.es/uk/cerveza`, `/cerveza`, `/pl/cerveza`:** виявлено `article.js-product-miniature` у контейнері `#js-product-list`, мовні версії `/`, `/uk/`, `/pl/`, `/ca/`, `/ru/`, `/ro/` (`hreflang`), незмінні іспанські слаги товарів, truncation видимих заголовків до `...` при повному тексті у `a.product_name[title]` та SSR-початковому JSON-LD `ItemList` у `<head>` (який не оновлюється після AJAX-пагінації/фільтрації).
2. **Живий `POST https://beer-api.ysilvestrov-ai.uk/match` + Algolia (`9WBO4RQ3HO`) + візуальні етикетки вітрини:**
   - `Carlsberg Ukraine / Львівське Світле` → `null`, тоді як `Carlsberg Ukraine / Lvivske Blonde` → `exact` (`untappd_id: 427481`, глобальна `2.99`), бо на Untappd у дужках стоїть латинська літера `i` (`Львівське Свiтле`); фото пляшки на вітрині підтверджує `ЛЬВІВСЬКЕ СВІТЛЕ`.
   - Фото пляшок із вітрини `extramagazin.es` підтверджують відповідність перекладених назв: `Пиво KOZEL світле 4.6%` має етикетку `Velkopopovický Kozel LEŽÁK` (`Kozel Premium Lager / Kozel 11`), `Пиво KOZEL "ЧОРНЕ" 3.8%` — етикетку `ČERNÝ`, `Пиво "BROWARY KSIAZECE" 5.5%` — класичну пляшку `TYSKIE Gronie`, `Пиво "STARY MELNIK" бочкове. м"яке. 4.2%` — бочкоподібну пляшку `Старый Мельник из Бочонка Мягкое`, `Пиво «Mago con maracuya» 4,0%` — етикетку `PERŁA MANGO Z MARAKUJĄ 4,0%` (і польську назву `Piwo „Perla mago con maracuya”`), `Пиво світле «Хмелевар» 4,2%` — логотип `ХМЕЛЕВАР`.
   - `Grupa Żywiec / Żywiec` при `abv: 5.6` у `/match` збігається з `Żywiec APA` (`bid 828396`), тоді як флагманський лагер на Untappd має `bid 10519` (`Żywiec`, 5.5%); тому `CANONICAL_BREWERIES.zywiec` лишає `'Żywiec'`.
   - `Browar Warka` використовується як канонічна назва бренду, але `Warka Energy Original` на Untappd (`bid 5788430`) належить `Grupa Żywiec`.
   - `Perła - Browary Lubelskie S.A. / PERLA CHMIELOWA` (`bid 20963`) та `Lech Browary Wielkopolski / LECH PREMIUM` (`bid 29306`) обидва дають `exact` без slug-override, якщо не відрізати початковий бренд із назви пива.
3. **Походження фікстур:** через Bunny Shield anti-bot PoW-захист `curl` отримує HTML-челендж із кодом 200; тому `extension/tests/fixtures/extramagazin.html` зібрано з реального DOM завантаженої у Chrome/WebView сторінки `/uk/cerveza` (24 картки, `hreflang`, JSON-LD `ItemList`, категорійне меню), а `extramagazin.nonbeer.html` містить реальну картку ікри, алкогольний коктейль Gin Tonic та подарунковий набір пива з келихом.

### Зміна

- Адаптер [extension/src/sites/extramagazin.ts](file:///Volumes/SRC/warsaw-beer-bot/extension/src/sites/extramagazin.ts):
  - `isNonBeerPage(url)` знімає мовний префікс `LANG_PREFIX_RE` і перевіряє чорний список `NON_BEER_PAGE_RE || NON_BEER_HREF_RE`.
  - `parseCards(root)` читає `article.js-product-miniature`, віддає `nonBeer: true` лише за позитивним сигналом (`isNonBeerName`, `NON_BEER_HREF_RE`, `isNonAlcoholicSoftDrinkFamily`), допускає `BEVERAGE_HREF_RE || BEVERAGE_TITLE_PREFIX_RE` (пиво, сидр, медовуха, радлер і квас з обов'язковим `kvas` після `bebida fermentada`), тихо пропускає решту та віддає `skip: true, skipReason: 'unparsed'` при порожній після чистки назві (`Пиво 500 мл`).
  - `productKey(href)` зрізає лише фасування, об'єм і тару (`lata`, `de-barril`), залишаючи ABV у ключі перед пошуком у `NORMALIZED_SLUG_OVERRIDES`, щоб не плутати `0.0%` й алкогольні релізи.
  - `stripLeadingBrandWhenRedundant` не відрізає бренд із кінця назви (`Estrella Damm`) чи із середини пивних назв (`PERLA CHMIELOWA`, `LECH PREMIUM`), а `cleanBeerName` зберігає крапки всередині назви (`St. Bernardus Abt 12`), не дописує кириличний префікс `Квас ` до латинських назв (`Kwas chlebowy Staropolski`) та захищає `Pack 6 5%` від хибного парсингу `abv: 6.5`.
  - Для уникнення колізій у клієнтському `normalizeKey()` (який лишає лише `[a-z0-9]`) усі безалкогольні назви (`abv === 0` або `sin alcohol`/`безалкогольне` тощо) зберігають суфікс `0.0%`, а суто кириличні назви (включно з 6 позиціями Опілля та загальними кириличними картками) отримують латинську транслітерацію `(Latin)` у дужках — серверний `stripSearchNoise()` відкидає дужки без цифр і `0.0%` перед запитом до Untappd.
- Реєстрація, UI та документація: `registry.ts`, `manifest.config.ts`, `supported-shops.ts`, `spec.md`, `extension/CHANGELOG.md`, `docs/extension-install-{en,uk}.md`, `site/index.html`, а також оновлені скріншоти `site/assets/popup-supported-shops-{collapsed,expanded}.png`.

## Заявка → доказ

Кожен запис у `NORMALIZED_SLUG_OVERRIDES` та `CANONICAL_BREWERIES` зв'язує конкретний товар магазину (`SKU` вітрини за назвою на 6 мовах, слагом, ABV та етикеткою на фото) з цільовим записом у базі Untappd (перевіреним через `POST https://beer-api.ysilvestrov-ai.uk/match` та Algolia `9WBO4RQ3HO`):

| Заявка (картка / override) | Свідчення з SKU магазину `extramagazin.es` | Доказ Untappd (`bid`) | Сила |
|---|---|---|---|
| `Grupa Żywiec / Warka Energy Original` | Назва UA/ES/PL `"ENERGY ORIGINAL" 0.0%`, бренд `WARKA`, 0.0% | Algolia `bid 5788430` (`Grupa Żywiec — Warka Energy Original`, 0.0%) | `[проба]` |
| `Pivovar Velké Popovice / Kozel Černý / Dark` | Назва UA/ES/PL `"ЧОРНЕ"`/`"NEGRO"`/`"KOZEL CIEMNE"`, 3.8%, етикетка на фото `Kozel ČERNÝ` | `/match` `exact`, `bid 70150` (rating 3.32) | `[проба]` |
| `Pivovar Velké Popovice / Kozel Premium Lager / Kozel 11` | Назва UA/ES/PL `KOZEL світле`/`claro`/`jasne`, 4.6%, етикетка на фото `Kozel LEŽÁK` (11°) | `/match` `exact`, `bid 30101` (rating 3.19) | `[проба]` |
| `Perła - Browary Lubelskie S.A. / Perła Mango z Marakują` | PL `"Perla mago con maracuya"`, 4%, етикетка на фото `PERŁA MANGO Z MARAKUJĄ 4,0%` | `/match` `exact`, `bid 6677906` (rating 3.38) | `[проба]` |
| `Tyskie Browary Książęce / Tyskie Gronie` | Бренд `TYSKIE`, назва `"BROWARY KSIAZECE"`, 5.5%, фото пляшки `TYSKIE Gronie` | `/match` `exact`, `bid 1409` (rating 3.12) | `[проба]` |
| `Ursus Breweries SA / Ursus Premium` | ES `"Ursus PREMIUM Blonde Lager"`, 5.0%, фото банки `URSUS PREMIUM` | `/match` `exact`, `bid 31468` (rating 2.93) | `[проба]` |
| `Browar Łomża / Łomża Mocna Wiśnia 9%` | Бренд `LOMZA`, UA `зі смаком вишні` / ES `con sabor a cereza` / PL `o smaku wiśni`, 9.0% | `/match` `exact`, `bid 6650446` (rating 2.86) | `[проба]` |
| `Browar Łomża / Łomża 0,0%` | Бренд `LOMZA`, `0.0%`, суфікс виробника `VAN PUR` у заголовку й слазі `-lomza-00-...-van-pur` | `/match` `exact`, `bid 2630288` (rating 2.54) | `[проба]` |
| `Browar Namysłów / Namysłów Pils` | Заголовок `NAMYSLOW 5,8%`, поле бренду містить власника `ZYWIEC` | `/match` `exact`, `bid 396095` (rating 3.08) | `[проба]` |
| `AB InBev Efes / Stary Melnik Iz Bochonka Myagkoe (...)` | UA `"STARY MELNIK" бочкове. м"яке.`, ES `de barril suave 4.3%`, фото бочонка `Из Бочонка Мягкое` | Algolia `bid 316140` (`AB InBev Efes — Stary Melnik Iz Bochonka Myagkoe...`) | `[проба]` |
| `Lidskae Piva (Лідскае Піва) / Zhigulevskoe special (...)` | Бренд `LIDA`, `ZHIGULEVSKOE`, 5.2% (ABV спеціальної лінійки Lidskae) | `/match` `exact`, `bid 259115` (rating 2.85) | `[проба]` |
| `Global Beer Georgia / Kayaki` | Бренд-заглушка `Marcas variadas`, напис `KAYAKI`, 4.7%, слаг `cerveza-clara-47-20500-ml-kayaki` | Algolia `bid 3238605` (`Global Beer Georgia — Kayaki`, 4.7%) | `[проба]` |
| `Carlsberg Ukraine / Lvivske 1715` | Бренд `LVIVSKE`, назва `«1715»`, 4.5%, слаг `cerveza-1715-45-...` | `/match` `exact`, `bid 50013` (rating 3.08) | `[проба]` |
| `Carlsberg Ukraine / Львівське 1715 Безалкогольне` | Бренд `LVIVSKE`, назва `безалкогольне «1715» 0,0%` | `/match` `exact`, `bid 4957154` (rating 2.72) | `[проба]` |
| `Carlsberg Ukraine / Lvivske Blonde` | Бренд `LVIVSKE`, фото пляшки `ЛЬВІВСЬКЕ СВІТЛЕ`, ES `Svitlo`, PL `Jasne` (3.7% на вітрині) | `/match` `exact`, `bid 427481` (`Львівське Свiтле`, 2.99) | `[проба]` |
| `AB InBev Efes Ukraine / Чернігівське Light` | Бренд `CHERNIGIVSKE`, назва `«Light»`, 4.3% | `/match` `exact`, `bid 5237230` (rating 2.85) | `[проба]` |
| `Опілля (Opillia) / Корифей (Koryfei)` | Бренд `OPILLIA`, назва `«Korifey export»`, розливне 4.2% | `/match` `exact`, `bid 346974` (rating 3.17) | `[проба]` |
| `Опілля (Opillia) / Білий Келих (Bilyi Kelykh)` | Бренд `OPILLIA`, назва `Білий келих` / ES `Bily kalykh`, розливне 4.2% | `/match` `exact`, `bid 6249716` (rating 3.36) | `[проба]` |
| `Опілля (Opillia) / Хмелевар (Khmelevar)` | Бренд `OPILLIA`, фото пляшки з етикеткою `ХМЕЛЕВАР`, ES/PL `Khmelevar`, 4.2% | `/match` `exact`, `bid 6251265` (rating 3.10) | `[проба]` |
| `Опілля (Opillia) / Квас Білий (Kvas Bilyi)` | Бренд `OPILLIA`, назва `Квас Білий живого бродіння`, слаг `kvas-blanco` | `/match` `exact`, `bid 2784378` (rating 2.97) | `[проба]` |
| `Опілля (Opillia) / Квас Чорний (Kvas Chornyi)` | Бренд `OPILLIA`, назва `Квас Чорний живого бродіння`, слаг `kvas-negro` | `/match` `exact`, `bid 6216762` (rating 3.45) | `[проба]` |
| `Опілля (Opillia) / Квас Домашній (Kvas Domashnii)` | Бренд `OPILLIA`, назва `Квас Домашній живого бродіння`, слаг `kvas-domashniy` | `/match` `exact`, `bid 5873830` (rating 3.14) | `[проба]` |
| `Carlsberg Ukraine / Kvass Taras Chornyi (Квас Тарас Чорний)` | Слаги `kvas-taras-negro-...-kayaki` (під дистриб'ютором `KAYAKI` на вітрині) | `/match` `exact`, `bid 1515439` (rating 2.93) | `[проба]` |
| `Lidskae Piva (Лідскае Піва) / Lidski Dark kvass (...)` | Бренд `LIDSKIY`, назва `Квас ЛІДСЬКИЙ "ТЕМНИЙ"`, слаги `lidskiy-oscuro` / `kvas-oscuro-lidskiy` | `/match` `exact`, `bid 430164` (rating 3.60) | `[проба]` |
| `Lidskae Piva (Лідскае Піва) / Lidski bread kvass (...)` | Бренд `LIDSKIY`, назва `Квас ЛІДСЬКИЙ "ХЛІБНИЙ"`, слаг `lidskiy-jlebniy` | `/match` `exact`, `bid 473058` (rating 3.33) | `[проба]` |

## Рев'ю спеки

| # | Перевірка | Рішення | Причина / що змінено |
|---|---|---|---|
| 1 | [6] Видалення ABV зі слага зливає різні сорти в одну ідентичність | Виправлено | У `productKey(href)` прибрано видалення чисел ABV — зберігаються всі ABV в ключах `NORMALIZED_SLUG_OVERRIDES`, а також додано тест, що `cerveza-clara-lomza-50-...` не отримує override `Łomża 0,0%` |
| 2 | [4] Таблиця доводить існування запису Untappd, але не перехід SKU магазину → сорт | Виправлено | Додано свідчення SKU магазину (`extramagazin.es`: мультимовні заголовки, слаги, ABV та назви на етикетках зображень із вітрини) поруч із Untappd `bid` у таблиці та розділі «Проби» |
| 3 | [1] Власник не бачить рішення показувати попередження на нерозібраних картках | Виправлено | У «Для власника» явно описано видимий бейдж-попередження «Не змогли розібрати цю картку» (`skipReason: 'unparsed'`) |
