# Health and safety details form

**Live form:** https://nasimuser01.github.io/safework-capability-assessment/

A web form built for the SafeWork NSW capability assessment. It collects personal, business and workplace health and safety details, validates input with regular expressions, shows or hides follow-up questions based on answers, and requires a reCAPTCHA before submission.

Built with plain HTML, SCSS and JavaScript – no framework.

## Run locally

```bash
npm install
npm run build:css   # compiles src/styles.scss -> css/styles.css
npm test            # runs the validator unit tests
```

Open `index.html` in a browser (or use a local server such as VS Code Live Server).

## Project structure

```
index.html        form markup
script.js         validators, conditional fields, error handling
src/styles.scss   source styles (NSW Design System colours, mobile-first)
css/styles.css    compiled output, committed so the site can be hosted statically
test/             unit tests for the validators and rule ordering
```

## Approach

**Start with the HTML.** The markup is complete and usable on its own: labels, hints, `required`, `type="email"` and `accept` all work before any CSS or JavaScript loads. The script and styles enhance it rather than replace it – for example the conditional panels are visible in plain HTML and only hidden once the script runs, and `noValidate` is set by the script so the browser's own validation remains as a fallback.

**Keep logic separate from the DOM.** The regular expressions and validator functions at the top of `script.js` are pure – they take a value and return true or false. That makes them unit-testable with `node --test` (93 cases) and reusable on a server, where validation must be repeated anyway.

**Describe behaviour in data, not code.** Two things drive the dynamic behaviour:

- Conditional panels declare what they depend on in markup: `data-conditional-for="policy" data-conditional-value="yes"`. Adding another Yes/No question with a follow-up is a markup-only change.
- Validation rules are a table: each field lists its checks in order with the message to show. The first failing check wins, so a user sees "Enter your ABN", then "ABN must be 11 digits", then "This ABN is not valid" as they get closer.

**Only as much tooling as the job needs.** The single dev dependency is `sass`. Tests use Node's built-in runner. The compiled CSS is committed so the form can be hosted anywhere static files are served.

## Key choices

| Decision | Reason |
|---|---|
| NSW Design System colours as SCSS tokens, not the full package | Matches NSW Government branding while keeping the stylesheet small and fully under my control. Every colour pair used was checked against WCAG contrast ratios. |
| Australian phone: strip formatting first, then match | Users type `(02) 9876-5432`, `+61 412 345 678`, `0412345678`. Removing spaces, hyphens and brackets before matching keeps the pattern readable: landlines (02/03/07/08), mobiles (04/05), the `+61` form, and 13/1300/1800 numbers. |
| ABN: regex for format **plus** a checksum | The pattern confirms 11 digits in ATO spacing. The Australian Business Register's modulus-89 check then catches transposed or mistyped digits that still look like an ABN – a different, more useful error message. |
| Email stricter than the HTML spec | `type="email"` accepts `a@b`. The pattern requires a labelled domain with a top-level domain, which is what a real address has. |
| File type checked by extension | Browsers report MIME types inconsistently (often empty on Windows). The extension is the reliable client-side signal; the server would verify content on upload. A 5 MB limit is enforced too. |
| Hidden fields are disabled, values kept | A disabled field is neither validated nor submitted, so a hidden answer can never leak. Keeping the value means an accidental "No" then "Yes" does not throw away an uploaded file. |
| "Required" errors only on submit | Format errors appear when leaving a field that has content; missing-field errors wait for submit. Tabbing past a field to read ahead is not punished. Once a field is in error, it re-checks on every keystroke so the message clears the moment it is fixed. |
| reCAPTCHA v2 checkbox with Google's public test key | Demonstrates the integration on any domain without a registered key. The site key is a single data attribute to swap for production. |

## Accessibility (WCAG 2.2 AA)

- **Structure** – `lang="en-AU"`, skip link, `header`/`main`/`footer` landmarks, one `h1`. Each section is a `fieldset` with a `legend`; the Yes/No questions are nested fieldsets so the question is announced as the group label.
- **Labels and hints** – every control has a visible `<label>`. Hints and error containers are linked with `aria-describedby`, so screen readers read them with the field. Required fields show an asterisk (hidden from assistive technology) plus visually-hidden "(required)" text, and the asterisk is explained in the instructions.
- **Input purpose** – `autocomplete` on name, address, phone, email and company (1.3.5), and `inputmode` so phones show the right keyboard.
- **Errors** – inline message under the field with a visually-hidden "Error:" prefix, `aria-invalid` on the control, and a red rule on the group. On submit, an error summary (`role="alert"`) lists every problem in page order; focus moves to it, and each entry is a link that moves focus to the field (3.3.1, 3.3.3).
- **Conditional reveal** – the revealing radio gets `aria-controls` and `aria-expanded`, so the change is announced.
- **Focus** – a single 2 px focus ring on every interactive element at 4.15:1 against white (2.4.7, 2.4.11).
- **Target size** – inputs, radios and buttons are at least 44 px tall (2.5.8).
- **Colour** – all text/background pairs are at least 4.5:1; borders and focus at least 3:1 (1.4.3, 1.4.11). Errors are never conveyed by colour alone.
- **Responsive** – mobile-first, single column, 16 px gutters, full-width button on phones; respects user font-size settings and `prefers-reduced-motion`; no horizontal scroll down to 320 px (1.4.10).
- **Success** – on valid submission the form is replaced by a `role="status"` confirmation that receives focus.

## Known limitations

- **reCAPTCHA** is a known accessibility compromise: its visual and audio challenges are hard for some users. In production I would prefer Cloudflare Turnstile or a server-side honeypot with rate limiting, which need no user interaction.
- **No backend.** Submission shows a confirmation; a real service would `POST` the `FormData`, repeat the validation server-side, and verify the reCAPTCHA token with Google.
- Tests cover the pure validators and rule ordering. The DOM behaviour was checked in a real browser during development; with more time I would add browser tests with Playwright.
