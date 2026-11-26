# Адаптер браузерного розширення для Bubbles Beers (`bubblesbeers.com`)

Дата: 2026-11-26
Статус: чекає на затвердження
Spec-review: codex/gpt-6.1-sol @ 92e9526 (author: agy) — 2 findings: 2 fixed, 0 rejected

## Для власника

**Мета.** Користувачі розширення бачать свій статус Untappd («вже пив» + особисту оцінку або глобальний рейтинг) на сторінках іспанського магазину крафтового пива `bubblesbeers.com` (каталог `/shop/`, категорії стилів, пагінація) — без потрапляння подарункових наборів, дегустацій, соди та мерчу в пошук, без хибного червоного `✕` на справжньому пиві з дескрипторами смаків чи серій на кшталт Tangerine чи Wolf Pack, і з видимим попередженням «Не змогли розібрати цю картку» для односегментних позицій без відомої броварні.

**Що зміниться для тебе.** Розширення отримує новий host permission для `https://bubblesbeers.com/*` та `https://*.bubblesbeers.com/*`. Через новий host permission наступний реліз потребуватиме ручного завантаження zip-пакета в Chrome Web Store (як задокументовано в `docs/extension-release.md`), а сама зміна на сервер нічого не додає і версію розширення не піднімає.

**На чому стоїть рішення.**
- Вітрина працює на WooCommerce SSR (тема Astra), де товари рендеряться в списку `ul.products` картками `li.product` із заголовками `h2.woocommerce-loop-product__title` `[проба]` (§Проби, 1).
- Повний обхід живого каталогу (усі 4 сторінки `/shop/`, 40 унікальних товарів) показує: 33 позиції — пиво (32 з трьохкомпонентною структурою `Brewery – Name – Style` та 1 однокомпонентна з відомою броварнею `Yakka Querida Ipa`), 7 — не-пиво; живі проби через `POST /match` знаходять 32 з 33 сортів (97.0% match rate, 31 exact, 1 fuzzy, 1 null) `[проба]` (§Проби, 1).
- Клієнтська канонізація броварень (`CANONICAL_BREWERIES`) критично необхідна: без неї `Montseny / IPA` дає `null` (промах), `Althaia` дає `fuzzy` замість `exact`, а `Yakka` без префікса `Cervezas` дає хибний збіг (`fuzzy`) на чужу броварню Amundsen Brewery `[проба]` (§Проби, 2).
- П'ять специфічних SKU (`SLUG_OVERRIDES`) покривають колаборації, де пиво зареєстроване на Untappd під другою броварнею (`Rio Azul x La Quince` під `La Quince Brewing Co.`), та релізи з префіксами стилю або дочірніми брендами (`TERP Fresh Press`, `TERP Golden Hour`, `FELIPPA BREW CO by Sáez & Son`, `Wildfires`), забезпечуючи exact збіг з цільовими `bid` `[проба]` (§Проби, 3).
- За `spec.md` §6 хибна відповідь гірша за відсутню: не-пиво фільтрується комбінацією глобального `isNonBeerName` по всій назві, префікса бренду `ES_NON_BEER_BRAND_RE` по першому сегменту та класів WooCommerce (`product_cat-packs`, `product_tag-soda` тощо), а картки без визначеної броварні отримують `skip: true, skipReason: 'unparsed'` з попередженням «Не змогли розібрати цю картку» замість запитів з порожньою броварнею `[вимога власника]`.

**Ключові рішення.**
1. Розбиття назви за дефісом на `Brewery – Name – Style` із очищенням кінцевих об'ємів (`33cl`, `44cl` тощо) як із назви, так і зі стилю, а для 2-сегментних назв `style` лишається `undefined`, щоб категорії магазину (`Maltosas`, `Colaboraciones`) не підміняли стиль — розглянуто стандартне: підставляти категорію магазину як стиль — відкинуто, бо навігаційні категорії вітрини не є пивними стилями для `/enrich/*`.
2. Клієнтський словник `CANONICAL_BREWERIES` для захисту від хибних збігів і промахів (Althaia, Attik, Basqueland, Deya, Garage, La Quince, La Sitgetana, Montseny, Octavo Arte, Oddity, Oso Brew, Rio Azul, Sáez & Son, Yakka) — розглянуто стандартне: передавати броварню як є і покладатися на нечіткий пошук сервера — відкинуто, бо жива проба виявила, що `Montseny / IPA` стає промахом (`null`), а `Yakka` дає хибний збіг на Amundsen Brewery.
3. `skipReason: 'unparsed'` («Не змогли розібрати цю картку») для односегментних назв без відомої броварні — розглянуто стандартне: надсилати у `/match` з `brewery: ''` — відкинуто, бо це створює безрезультатні запити та ризик хибного матчу на поширені назви.
4. Дворівнева фільтрація не-пива: глобальний `isNonBeerName` по всій назві + `ES_NON_BEER_BRAND_RE` строго по першому сегменту (бренду) + категорії/теги WooCommerce — розглянуто стандартне: шукати іспанські слова не-пива по всій назві — відкинуто, бо це ставило червоний `✕` на справжнє пиво з назвами на кшталт `Tangerine Dream`, `Wolf Pack`, `Cream Soda Sour`, `Cola de Caballo`, `Copa del Rey`.
5. Збереження оригінальної іспанської назви з `data-success_message` кнопки додавання в кошик для захисту від вбудованого автоперекладу браузера.

**Що стане гірше.** Товари нових іспанських крафтових броварень з односегментними назвами (без роздільника ` – ` і поза `KNOWN_BREWERIES`) не надішлються у `/match`, а покажуть жовтий бейдж-попередження «Не змогли розібрати цю картку» до додавання броварні в словник.

**Оцінка.** Власник: S. Автор: S — адаптер (~40%), фікстури та тести (~35%), документація/спека/скріншоти (~25%).

**Питання до власника.** Немає.

## Тіло

### Проби

1. **Живий браузер і повний HTTP-обхід каталогу `bubblesbeers.com`:**
   - Повністю опитано всі 4 сторінки каталогу магазину (`/shop/`, `/shop/page/2/`, `/shop/page/3/`, `/shop/page/4/`; сторінка 5 повертає 404).
   - Каталог містить рівно 40 унікальних SKU (дедуплікованих за посиланням на товар): 33 пивні позиції та 7 не-пивних (паки, сода, коробки-сюрпризи).
   - Розподіл структур назв пивних товарів: 32 мають трисегментну структуру `Brewery – Name – Style`, 0 — двосегментну, 1 — односегментну з відомою броварнею (`Yakka Querida Ipa`).
   - Усі 33 пивні картки надіслано до `POST https://beer-api.ysilvestrov-ai.uk/match`.
   - **Результат матчингу:** 31 exact match, 1 fuzzy match, 1 null match (32/33 знайдено, загальний match rate 97.0%).

2. **Порівняння raw-броварні проти канонічної форми (`CANONICAL_BREWERIES`):**
   - `Montseny / IPA`: з raw `Montseny` дає `null` (промах); з канонічною `Companyia Cervesera del Montseny` дає `exact` (`bid 199890`).
   - `Yakka / German Pils`: з raw `Yakka` дає хибний `fuzzy` збіг на `Amundsen Brewery - 9th Birthday Cake...` (`bid 5141210`); з канонічною `Cervezas Yakka` дає `null` (захист від показу чужого пива).
   - `Althaia / Barlovento`: з raw `Althaia` дає `fuzzy`; з канонічною `Cervezas Althaia` дає `exact` (`bid 1903411`).
   - `Althaia / Mascarat`: з raw `Althaia` дає `fuzzy`; з канонічною `Cervezas Althaia` дає `exact` (`bid 2407179`).
   - `Garage / Lollies`: обидві дають `exact` (`bid 6721018`).
   - `La Quince / Mr. Bubbles`: обидві дають `exact` (`bid 6196638`).
   - `La Sitgetana / Maricel`: обидві дають `exact` (`bid 2329121`).
   - `Basqueland / Imparable`: обидві дають `exact` (`bid 801901`).
   - `Deya / Steady Rolling Man`: обидві дають `exact` (`bid 1202873`).
   - `Oddity / Wildfires`: обидві дають `exact` (`bid 6147841`).
   - `Oso Brew / Ace High`: обидві дають `exact` (`bid 7659216`).
   - `Saez & Son / TERP Fresh Press`: обидві дають `exact` (`bid 7180590`).

3. **Аналіз оверрайдів (`SLUG_OVERRIDES`):**
   - `rio-azul-x-laquince-a-giant-leap-for-an-ape-tiramisu-patry-stout`:
     - Назва на вітрині: `Rio Azul x La Quince – A Giant Leap for an Ape – Tiramisú Pastry Stout`.
     - На Untappd сорт зареєстровано під `La Quince Brewing Co.` як `A GIANT LEAP FOR AN APE!` (`bid 7401043`). Без оверрайду колаборація розбивається за першою броварнею `RIOAZUL`, що дає `null`. З оверрайдом — `exact`.
   - `saez-son-saezsonf-fresh-press-te-rp-smoothiesour`:
     - Назва на вітрині: `Saez & Son – Fresh Press – TERP Smoothie Sour`.
     - На Untappd назва сорту включає лінійку: `TERP Fresh Press` (`bid 7180590`). Без оверрайду запит `Fresh Press` дає лише `fuzzy`. З оверрайдом `TERP Fresh Press` — `exact`.
   - `saez-son-golden-hour-terp-smoothie-sour`:
     - Назва на вітрині: `Saez & Son – Golden Hour – TERP Smoothie Sour`.
     - На Untappd назва сорту: `TERP Golden Hour` (`bid 7180377`). Без оверрайду — `fuzzy`. З оверрайдом — `exact`.
   - `saezson-felippa-west-coast-ipa`:
     - Назва на вітрині: `Saez & Son – Felippa – West Coast IPA`.
     - На Untappd зареєстровано як окремий бренд `FELIPPA BREW CO by Sáez & Son` (`bid 6833796`).
   - `oddity-wildfires`:
     - Назва на вітрині містить однину: `Oddity – Wildfire – Neipa`.
     - На Untappd назва в множині: `Wildfires` (`bid 6147841`). Без оверрайду — `fuzzy`. З оверрайдом — `exact`.

4. **Поведінка карток без броварні:**
   - Для гіпотетичної односегментної картки без відомої броварні (наприклад `Attikus Lager`):
     - Запит до `POST /match` із `brewery: ''` повертає `matched_beer: null`.
     - Позначення картки через `skip: true, skipReason: 'unparsed'` не виконує марний мережевий запит та рендерить користувачу жовтий бейдж-попередження «Не змогли розібрати цю картку» замість сірого/відсутнього бейджа.

### Зміна

- Адаптер `extension/src/sites/bubblesbeers.ts`:
  - `isNonBeerPage(url)` перевіряє чорний список шляхів (блог, дегустації, кошик, акаунт).
  - `parseCards(root)`:
    - Читає заголовок через `extractOriginalTitle` (з `data-success_message` або `.woocommerce-loop-product__title`).
    - Перевіряє не-пиво: `isNonBeerName(rawTitle)` по всій назві, `ES_NON_BEER_BRAND_RE` по першому сегменту, категорії `Packs`/`Refrescos` та класи WooCommerce.
    - Парсить назву за трьох- або двокомпонентною схемою `Brewery – Name – Style`.
    - Очищає кінцеві об'єми (`33cl`, `44cl`, `75cl`, `1l`) як з назви, так і зі стилю функцією `stripVolume`.
    - Для 2-сегментних назв поле `style` залишає `undefined`, захищаючи від підміни стилю категоріями магазину.
    - Для односегментних назв шукає броварню в `KNOWN_BREWERIES` з обов'язковою межею слова.
    - Якщо броварню чи назву визначити не вдалося (включно з пропущеними сегментами `Garage – – IPA`, `– Soup – Hazy IPA` або порожньою після чищення об'єму назвою `Garage – 44cl – IPA`), віддає `skip: true, skipReason: 'unparsed'`.
    - Застосовує `CANONICAL_BREWERIES` та `SLUG_OVERRIDES`.
- Тести `extension/src/sites/bubblesbeers.test.ts`:
  - 11 тестів, що покривають повний контракт: фікстура, захист від хибного не-пива, чищення об'ємів, межа слів, unparsed картки, збереження іспанського заголовка, колаборації та класи WooCommerce.
- Реєстрація та документація:
  - `registry.ts`, `manifest.config.ts`, `supported-shops.ts`, `spec.md`, `extension/CHANGELOG.md`, `docs/extension-install-{en,uk}.md`, `site/index.html` та перезняті скріншоти popup.

## Заявка → доказ

Кожен запис у `CANONICAL_BREWERIES` та `SLUG_OVERRIDES` зв'язує конкретний товар магазину (`SKU` вітрини за назвою, слагом та етикеткою) з цільовим записом у базі Untappd (перевіреним через `POST https://beer-api.ysilvestrov-ai.uk/match`):

| Заявка (картка / override) | Свідчення з SKU магазину `bubblesbeers.com` | Доказ Untappd (`bid`) | Сила |
|---|---|---|---|
| `Cervezas Althaia / Barlovento` | Заголовок `Althaia – Barlovento – Smoked Imperial Stout` | `/match` `exact`, `bid 1903411` (rating 3.84) | `[проба]` |
| `Cervezas Althaia / Mascarat` | Заголовок `Althaia – Mascarat – Black Rye IPA` | `/match` `exact`, `bid 2407179` (rating 3.82) | `[проба]` |
| `Cervezas Althaia / Mediterranean IPA` | Заголовок `Althaia – Mediterranean IPA – American ipa` | `/match` `exact`, `bid 1032784` (rating 3.66) | `[проба]` |
| `Attik Brewing / Smile` | Заголовок `Attik – Smile – West Coast IPA sin gluten` | `/match` `exact`, `bid 5740441` (rating 3.75) | `[проба]` |
| `Attik Brewing / Zessie` | Заголовок `Attik – Zessie – Wild Ale Cereza` | `/match` `exact`, `bid 6487512` (rating 3.94) | `[проба]` |
| `Basqueland Brewing / Imparable` | Бренд `Basqueland`, флагманська IPA вітрини | `/match` `exact`, `bid 801901` (rating 3.74) | `[проба]` |
| `DEYA Brewing Company / Steady Rolling Man` | Бренд `Deya`, флагманська лінійка вітрини | `/match` `exact`, `bid 1202873` (rating 3.97) | `[проба]` |
| `Garage Beer Co. / Lollies` | Заголовок `Garage – Lollies – Berliner weisse` | `/match` `exact`, `bid 6721018` (rating 3.79) | `[проба]` |
| `Garage Beer Co. / Stef` | Заголовок `Garage – Stef – West Coast Pils` | `/match` `exact`, `bid 6721219` (rating 3.78) | `[проба]` |
| `Garage Beer Co. / Viduka` | Заголовок `Garage – Viduka – New England Pale Ale` | `/match` `exact`, `bid 6721221` (rating 3.89) | `[проба]` |
| `La Quince Brewing Co. / Mr. Bubbles` | Заголовок `La Quince – Mr. Bubbles – Czech Lager Sin Gluten` | `/match` `exact`, `bid 6196638` (rating 3.42) | `[проба]` |
| `La Quince Brewing Co. / The Wonder Blade` | Заголовок `La Quince – The Wonder Blade – West Coast Pils` | `/match` `exact`, `bid 6701041` (rating 3.65) | `[проба]` |
| `La Sitgetana Craftbeer / Maricel` | Заголовок `La Sitgetana – Maricel – American Pale ale` | `/match` `exact`, `bid 2329121` (rating 3.52) | `[проба]` |
| `La Sitgetana Craftbeer / Ultra Citra` | Заголовок `La Sitgetana – Ultra Citra – Hoppy lager` | `/match` `exact`, `bid 6630520` (rating 3.74) | `[проба]` |
| `Companyia Cervesera del Montseny / IPA` | Заголовок `Montseny – IPA – American IPA` | `/match` `exact`, `bid 199890` (rating 3.39) | `[проба]` |
| `Octavo Arte / 1521` | Заголовок `Octavo Arte – 1521 – Porter sin gluten` | `/match` `exact`, `bid 1509054` (rating 3.64) | `[проба]` |
| `Octavo Arte / Dumbo` | Заголовок `Octavo Arte – Dumbo – Hazy IPA` | `/match` `exact`, `bid 7318827` (rating 3.96) | `[проба]` |
| `Octavo Arte / Magia Blanca` | Заголовок `Octavo Arte – Magia Blanca – Milkshake IPA` | `/match` `exact`, `bid 7662143` (rating 3.91) | `[проба]` |
| `Octavo Arte / Ultra Ligera` | Заголовок `Octavo Arte – Ultra Ligera – Hazy Pale Ale` | `/match` `exact`, `bid 7662142` (rating 3.80) | `[проба]` |
| `Oddity Brewing / Wildfires` (override) | Слаг `oddity-wildfires`, назва `Oddity – Wildfire – Neipa` | `/match` `exact`, `bid 6147841` (rating 3.86) | `[проба]` |
| `Oso Brew Co / Ace High` | Заголовок `Oso Brew – Ace High – West Coast IPA` | `/match` `exact`, `bid 7659216` (rating 3.84) | `[проба]` |
| `RIOAZUL / Flora` | Бренд `Rio Azul`, севільська броварня | `/match` `bid 1863675` (rating 3.58) | `[проба]` |
| `La Quince Brewing Co. / A GIANT LEAP FOR AN APE!` (override) | Слаг `rio-azul-x-laquince-a-giant-leap-for-an-ape-...` | `/match` `exact`, `bid 7401043` (rating 3.80) | `[проба]` |
| `Sáez & Son / TERP Fresh Press` (override) | Слаг `saez-son-saezsonf-fresh-press-te-rp-smoothiesour` | `/match` `exact`, `bid 7180590` (rating 3.94) | `[проба]` |
| `Sáez & Son / TERP Golden Hour` (override) | Слаг `saez-son-golden-hour-terp-smoothie-sour` | `/match` `exact`, `bid 7180377` (rating 3.88) | `[проба]` |
| `FELIPPA BREW CO by Sáez & Son / FELIPPA` (override) | Слаг `saezson-felippa-west-coast-ipa` | `/match` `exact`, `bid 6833796` (rating 3.81) | `[проба]` |
| `Cervezas Yakka / German Pils` | Заголовок `Yakka – German Pils` | Захист від хибного збігу на Amundsen Brewery | `[проба]` |
| `Cervezas Alhambra / Reserva 1925` | Бренд `Alhambra`, іспанська класика | `/match` `exact`, `bid 40173` (rating 3.29) | `[проба]` |

## Рев'ю спеки

| # | Перевірка | Рішення | Причина / що змінено |
|---|---|---|---|
| 1 | [4] Доказ ідентичності двох сортів суперечливий (однаковий `bid 6630520` для Zessie та Ultra Citra) | Виправлено | Звірено через `POST /match`: для `Attik Brewing / Zessie` встановлено справжній `bid 6487512` (rating 3.94); `bid 6630520` належить `La Sitgetana Craftbeer / Ultra Citra`. |
| 2 | [2] Проба вибірки не доводить заявлене покриття всього асортименту | Виправлено | Проведено повний обхід усіх 4 сторінок `/shop/` (40 унікальних товарів, дедуплікованих за посиланням): виявлено 33 пивні картки та 7 не-пивних; уточнено розподіл структур назв (32 трисегментні, 1 односегментна `Yakka`) та реальні результати `/match` (31 exact, 1 fuzzy, 1 null, 97.0% match rate). |
