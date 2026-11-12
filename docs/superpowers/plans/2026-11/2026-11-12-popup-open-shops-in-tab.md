# План: відкриття підтримуваних магазинів у новій вкладці

Спека: `docs/superpowers/specs/2026-11/2026-11-12-popup-open-shops-in-tab-design.md`.

## Задача 1 — перехід на openShopTab, підтримка модифікаторів Ctrl/Cmd/Shift та єдиний запасний шлях

Файли:
- `extension/src/popup/supported-shops.ts`
- `extension/src/popup/supported-shops.test.ts`
- `docs/extension-install-uk.md`
- `docs/extension-install-en.md`
- `extension/CHANGELOG.md`
- `spec.md`

1. **`supported-shops.ts`**:
   - Замінити `openShopWindow` на `openShopTab(url, tabsApi = chrome.tabs)`, що викликає `await tabsApi.create({ active: true, url })`.
   - У `renderSupportedShops`: пропускати подію без `preventDefault()`, якщо `event.ctrlKey || event.metaKey || event.shiftKey` (без `altKey`, щоб не ініціювати скачування HTML-файлу).
   - Оновити `aria-label` посилання на `Open ${shop.name} in a new tab`.
   - Залишити єдиний запасний шлях в обробнику кліку: `void Promise.resolve(open(shop.url)).catch(() => { window.open(shop.url, '_blank', 'noopener'); })`.
2. **`supported-shops.test.ts`**:
   - Перевірити для звичайного кліку `event.defaultPrevented === true`, `expect(open).toHaveBeenCalledTimes(1)` та `aria-label`.
   - Перевірити дефолтний параметр `open = openShopTab` (`renderSupportedShops(container, ['en-GB'])` без третього аргументу): `event.defaultPrevented === true` і `chrome.tabs.create` викликано 1 раз з `{ active: true, url: link.href }`.
   - Перевірити модифікатори: для `ctrlKey`, `metaKey`, `shiftKey` — `defaultPrevented === false` і `open` не викликається; для `altKey` — `defaultPrevented === true` і `open` викликається 1 раз.
   - Перевірити живий запасний шлях через дефолтний `open = openShopTab`: коли `chrome.tabs.create` відхиляє проміс, викликається `window.open(link.href, '_blank', 'noopener')` 1 раз.
   - Перевірити `openShopTab`: `create` викликано 1 раз із `{ active: true, url }`.
3. **Документація та специфікація**:
   - `docs/extension-install-uk.md` та `docs/extension-install-en.md`: оновити опис відкриття магазину у новій активній вкладці.
   - `spec.md`: оновити речення про відкриття магазину в новій активній вкладці та пропуск кліків із Ctrl/Cmd або Shift.
   - `extension/CHANGELOG.md`: додати запис у `[Unreleased]`.
4. **Перевірка мутаціями та гейт**:
   - Перевірити мутаціями, що видалення `event.preventDefault()`, видалення `.catch(() => window.open(...))` або додавання `altKey` валять відповідні тести.
   - `npm test` та `npm run typecheck` в `extension/` і корені.
