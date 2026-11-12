# Відкриття підтримуваних магазинів у новій вкладці замість окремого вікна — дизайн

Дата: 2026-11-12
Статус: чекає на затвердження
Spec-review: failed (author: codex; claude: not installed; agy: not installed)
План: `docs/superpowers/plans/2026-11/2026-11-12-popup-open-shops-in-tab.md`

## Для власника

**Мета.** Клік на магазин у списку «Supported shops» у попапі розширення відкриває його в новій активній вкладці поточного вікна браузера замість створення окремого вікна.

**Що зміниться для тебе.**
- У роботі бота та операційній частині: нічого (зміна стосується лише попапу браузерного розширення, без міграцій і без кроків на хості).
- Для користувача розширення: звичайний клік на магазин відкриває нову активну вкладку замість окремого вікна браузера. Крім того, кліки з Ctrl/Cmd (фонова вкладка) та Shift (нове вікно) більше не перехоплюються і працюють як стандартні жести браузера (раніше всі ліві кліки перехоплювалися `preventDefault()` і примусово викликали `windows.create`).

**На чому стоїть рішення.**
- `[вимога власника]` змінити відкриття магазинів із нового вікна на нову вкладку та не змінювати версію розширення.
- `[вимога власника]` повністю видалити `openShopWindow` і його тести замість збереження аліасу.
- `[виведення]` кліки з затиснутими Ctrl/Cmd або Shift не слід перехоплювати через `event.preventDefault()`, щоб у попапі працювали стандартні браузерні комбінації відкриття фонової вкладки й окремого вікна; водночас Alt+клік перехоплювати потрібно, бо нативне «завантажити за посиланням» у Chrome скачує HTML-сторінку магазину як файл.

**Ключові рішення.**
1. **Замінити `openShopWindow` (`chrome.windows.create`) на `openShopTab` (`chrome.tabs.create({ active: true, url })`).** Відкинуто: залишити `openShopWindow` як аліас — зайвий експорт, який ніде поза модулем не використовується.
2. **Єдиний запасний шлях (`window.open(shop.url, '_blank', 'noopener')`) у `.catch()` обробника кліку.** Відкинуто: окремий `fallback`-параметр у `openShopTab` плюс `try/catch` в обробнику — це дублює `window.open` і робить гілку в обробнику мертвою в проді, бо `openShopTab` сам ковтав би помилку.
3. **Пропускати нативну подію браузера лише для `event.ctrlKey || event.metaKey || event.shiftKey` (без `altKey`).** Відкинуто: пропускати також `altKey` — у Chrome Alt/Option+клік ініціює завантаження файлу за посиланням.
- **Розглянуто стандартне:** повністю прибрати JS-обробник кліку та `openShopTab`, поклавшись на нативний `<a href="..." target="_blank" rel="noopener">`. Відкинуто: явний виклик `chrome.tabs.create({ active: true, url })` через інжектований `open: ShopOpener = openShopTab` зберігає наявну тестову архітектуру модуля й прямо перевіряє виклик API вкладок.

**Що стане гірше.**
- Користувачі, які хотіли відкривати магазин в окремому вікні одним кліком, тепер для окремого вікна мають використовувати Shift+клік.

**Оцінка.**
- Власник: — (оцінку не запитано до написання коду).
- Автор: S — 1 PR, 1 задача в плані (~40% код і тести, ~60% документація й спека).
- Дешевший варіант (XS): прибрати JS-обробник кліку й `openShopTab`, залишивши тільки `<a target="_blank">` — втрачається інжекція `ShopOpener` і пряма перевірка виклику `chrome.tabs.create` у unit-тестах.
- Фактично: — (дописується після мерджу)

**Питання до власника.** Немає.

---

## 1. Контекст і зміна поведінки

У попередній реалізації (`extension/src/popup/supported-shops.ts`) клік на магазин у списку «Supported shops» викликав `openShopWindow`, який створював окреме вікно через `chrome.windows.create({ focused: true, url })` із запасним викликом `chrome.tabs.create({ active: true, url })`, а сам обробник кліку безумовно викликав `event.preventDefault()` на кожен лівий клік (включно з Ctrl/Cmd+клік та Shift+клік).

За вимогою власника поведінка змінюється:
1. Звичайний клік відкриває магазин у новій активній вкладці поточного вікна (`chrome.tabs.create({ active: true, url })`).
2. Кліки з модифікаторами `ctrlKey`, `metaKey` або `shiftKey` не перехоплюються (`event.preventDefault()` не викликається), щоб браузер нативно відкривав фонову вкладку або нове вікно. Клік з `altKey` перехоплюється як звичайний клік, щоб запобігти скачуванню HTML-сторінки.
3. Якщо виклик `open(shop.url)` завершується помилкою (відхилений проміс від `chrome.tabs.create` або синхронний виняток), спрацьовує єдиний запасний шлях `window.open(shop.url, '_blank', 'noopener')`.

## 2. Реалізація

### 2.1. `openShopTab`
Функція `openShopWindow` та інтерфейс `WindowCreator` видаляються. Замість них експортується `openShopTab`:
```typescript
interface TabCreator {
  create(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab>;
}

export async function openShopTab(
  url: string,
  tabsApi: TabCreator = chrome.tabs,
): Promise<void> {
  await tabsApi.create({ active: true, url });
}
```

### 2.2. Обробник кліку в `renderSupportedShops`
Посилання отримують `aria-label="Open ${shop.name} in a new tab"`.
В обробнику `click`:
```typescript
link.addEventListener('click', (event) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  void Promise.resolve(open(shop.url)).catch(() => {
    window.open(shop.url, '_blank', 'noopener');
  });
});
```

## 3. Заявка → доказ

Нових записів стану (БД, кеш, курсори) зміна не вводить. Твердження про поведінку UI та їхні докази в тестах:

| Що система стверджує / на що спирається | Доказ |
|---|---|
| Звичайний клік скасовує нативний перехід (`defaultPrevented === true`) і викликає `open` рівно один раз | Unit-тест у `supported-shops.test.ts` диспатчить `MouseEvent('click', { cancelable: true })` і перевіряє `event.defaultPrevented === true` та `toHaveBeenCalledTimes(1)` |
| Дефолтний параметр `open = openShopTab` у `renderSupportedShops` викликає `chrome.tabs.create({ active: true, url })` | Unit-тест викликає `renderSupportedShops(container, ['en-GB'])` без третього аргументу зі стабом `chrome.tabs.create` |
| При відмові `chrome.tabs.create` у дефолтному оупенері спрацьовує живий запасний шлях `window.open(url, '_blank', 'noopener')` | Unit-тест викликає `renderSupportedShops(container, ['en-GB'])` зі стабом `chrome.tabs.create`, що кидає помилку, і перевіряє виклик `window.open` |
| Кліки з Ctrl, Cmd або Shift не перехоплюються, а Alt+клік перехоплюється | Unit-тест перевіряє `defaultPrevented === false` та відсутність виклику `open` для `ctrlKey`/`metaKey`/`shiftKey`, і `defaultPrevented === true` та виклик `open` для `altKey` |
| Посилання має `aria-label` про нову вкладку | Unit-тест перевіряє `flasker.getAttribute('aria-label') === 'Open Flasker in a new tab'` |

## 4. Рев'ю спеки

Прогін `npm run cross-review -- --author codex --spec docs/superpowers/specs/2026-11/2026-11-12-popup-open-shops-in-tab-design.md` завершився з `Spec-review: failed (author: codex; claude: not installed; agy: not installed)` (бінарники ланцюжка рецензентів не встановлені в PATH).

