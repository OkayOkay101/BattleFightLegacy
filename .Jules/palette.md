## 2024-11-20 - Adding ARIA labels to EJS templates
**Learning:** Found that some action buttons and inputs in the chat UI (`src/templates/chat.ejs`) lacked proper ARIA labels, and icons were not hidden from screen readers.
**Action:** Added `aria-label` to input and button elements and `aria-hidden="true"` to FontAwesome `<i>` icons to improve accessibility for screen readers. Ensure similar patterns are followed when adding new icon-only buttons or forms in templates.
