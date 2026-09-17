// SafeWork NSW Capability Assessment – form behaviour
//
//   1. Validators   – pure functions, no DOM, unit-tested in test/
//   2. Conditional fields
//   3. Validation rules and error display
//   4. Init (browser only)

// ---------------------------------------------------------------------------
// 1. Validators
// Pure predicates: (value) => boolean. No DOM access, so they run in Node
// tests and could be reused server-side.
// ---------------------------------------------------------------------------

export const patterns = {
  // Formatting people type into phone fields: spaces, hyphens, dots, brackets.
  phoneNoise: /[\s().-]/g,

  // Australian phone number, applied after noise is stripped:
  //   (?:\+?61|0)[2-578]\d{8}  landline (02/03/07/08) or mobile (04/05),
  //                             local (0…) or international (+61…) form
  //   1[38]00\d{6}              1300 / 1800 numbers
  //   13\d{4}                   six-digit 13 numbers
  auPhone: /^(?:(?:\+?61|0)[2-578]\d{8}|1[38]00\d{6}|13\d{4})$/,

  // Email: RFC 5322 local part, then domain labels (letters/digits, internal
  // hyphens, max 63 chars) and a TLD. Stricter than HTML's type=email,
  // which accepts "a@b".
  email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,

  // ABN: 11 digits, first digit never 0, optional ATO 2-3-3-3 spacing.
  abn: /^[1-9]\d ?\d{3} ?\d{3} ?\d{3}$/,

  // Allowed upload types by extension. Browser MIME types are unreliable
  // (often empty on Windows), so the extension is the dependable signal.
  policyFile: /\.(pdf|docx?)$/i,
};

// Weighting factors published by the Australian Business Register.
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const validators = {
  // Strings must be non-blank; anything else (e.g. a File) must be present.
  required(value) {
    return typeof value === 'string' ? value.trim() !== '' : Boolean(value);
  },

  auPhone(value) {
    return patterns.auPhone.test(value.trim().replace(patterns.phoneNoise, ''));
  },

  email(value) {
    return patterns.email.test(value.trim());
  },

  abnFormat(value) {
    return patterns.abn.test(value.trim());
  },

  // ABR modulus-89 check: subtract 1 from the first digit, weight each
  // digit, and the sum must divide by 89. Catches typos the format cannot.
  abnChecksum(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    const sum = ABN_WEIGHTS.reduce(
      (total, weight, i) => total + (Number(digits[i]) - (i === 0 ? 1 : 0)) * weight,
      0,
    );
    return sum % 89 === 0;
  },

  policyFileType(file) {
    return Boolean(file) && patterns.policyFile.test(file.name);
  },

  policyFileSize(file) {
    return Boolean(file) && file.size <= MAX_FILE_BYTES;
  },
};

// ---------------------------------------------------------------------------
// 2. Conditional fields
// A panel declares its dependency in markup:
//   <div data-conditional-for="policy" data-conditional-value="yes">
// Adding another conditional question is a markup-only change.
// ---------------------------------------------------------------------------

export function initConditionalFields(form) {
  form.querySelectorAll('[data-conditional-for]').forEach((panel) => {
    const { conditionalFor: name, conditionalValue: expected } = panel.dataset;
    const controls = [...form.querySelectorAll(`[name="${name}"]`)];
    const trigger = controls.find((c) => c.value === expected);
    if (trigger) trigger.setAttribute('aria-controls', panel.id);

    const update = () => {
      const visible = form.elements[name].value === expected;
      panel.hidden = !visible;
      if (trigger) trigger.setAttribute('aria-expanded', String(visible));
      panel.querySelectorAll('input, select, textarea').forEach((field) => {
        // Disabled fields are neither validated nor submitted, so a hidden
        // answer never leaks. Values are kept, so an accidental "No" then
        // "Yes" does not discard an uploaded file.
        field.disabled = !visible;
        field.required = visible && field.hasAttribute('data-required');
      });
    };

    controls.forEach((c) => c.addEventListener('change', update));
    update(); // initial state (also covers browser-restored answers)
  });
}

// ---------------------------------------------------------------------------
// 3. Validation rules and error display
// Rules are data: field name -> ordered { test, message }. The first failing
// rule wins, so messages progress from missing -> wrong format -> invalid.
// ---------------------------------------------------------------------------

// Optional field: empty passes, otherwise the format test applies.
const optional = (test) => (value) => !validators.required(value) || test(value);

const PHONE_MESSAGE = 'Enter an Australian phone number, like 0412 345 678 or 02 9876 5432';

export const rules = {
  phone: [{ test: optional(validators.auPhone), message: PHONE_MESSAGE }],
  email: [
    { test: validators.required, message: 'Enter your email address' },
    { test: validators.email, message: 'Enter an email address in the correct format, like name@example.com' },
  ],
  abn: [
    { test: validators.required, message: 'Enter your ABN' },
    { test: validators.abnFormat, message: 'ABN must be 11 digits, like 51 824 753 556' },
    { test: validators.abnChecksum, message: 'This ABN is not valid. Check the digits and try again' },
  ],
  policy: [
    { test: validators.required, message: 'Select yes if your company has a health and safety policy' },
  ],
  'policy-file': [
    { test: validators.required, message: 'Attach a copy of your health and safety policy' },
    { test: validators.policyFileType, message: 'The policy must be a PDF or Word document (.pdf, .doc or .docx)' },
    { test: validators.policyFileSize, message: 'The policy must be 5 MB or smaller' },
  ],
  hsr: [
    { test: validators.required, message: 'Select yes if your company has a health and safety representative' },
  ],
  'hsr-name': [
    { test: validators.required, message: 'Enter the name of your health and safety representative' },
  ],
  'hsr-phone': [{ test: optional(validators.auPhone), message: PHONE_MESSAGE }],
};

// Pure: the first failing rule's message, or null when valid.
export function firstError(fieldRules, value) {
  const failed = fieldRules.find((rule) => !rule.test(value));
  return failed ? failed.message : null;
}

// Everything the DOM code needs about one named field. form.elements[name]
// is a single element, or a RadioNodeList for a radio group.
function fieldOf(form, name) {
  const control = form.elements[name];
  const controls = control instanceof RadioNodeList ? [...control] : [control];
  return {
    controls,
    target: controls[0], // where error-summary links send focus
    group: controls[0].closest('.form__group'),
    errorEl: form.querySelector(`#${name}-error`),
    value: control.type === 'file' ? control.files[0] : control.value,
    disabled: controls.every((el) => el.disabled), // inside a hidden panel
  };
}

// Shows a message on a field, or clears it when message is null.
function setError({ controls = [], group, errorEl }, message) {
  errorEl.replaceChildren();
  if (message) {
    const prefix = document.createElement('span'); // screen readers only
    prefix.className = 'visually-hidden';
    prefix.textContent = 'Error: ';
    errorEl.append(prefix, message);
  }
  errorEl.hidden = !message;
  group.classList.toggle('form__group--error', Boolean(message));
  controls.forEach((el) => {
    if (message) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  });
}

const inError = (form, name) => !fieldOf(form, name).errorEl.hidden;

// Validates one field and updates its inline error.
// Returns { message, target } or null.
export function validateField(form, name) {
  const field = fieldOf(form, name);
  const message = field.disabled ? null : firstError(rules[name], field.value);
  setError(field, message);
  return message ? { message, target: field.target } : null;
}

// Validates every ruled field, in document order.
export function validateForm(form) {
  const names = [...new Set([...form.elements].map((el) => el.name))];
  return names.filter((name) => rules[name]).map((name) => validateField(form, name)).filter(Boolean);
}

// reCAPTCHA sits outside form.elements, so it gets its own small check that
// returns the same { message, target } shape.
const CAPTCHA_UNSOLVED = 'Tick the box to confirm you are not a robot';
const CAPTCHA_UNAVAILABLE = 'The security check did not load. Check your connection and reload the page';

function captchaField(captchaEl) {
  return { group: captchaEl.closest('.form__group'), errorEl: document.getElementById('captcha-error') };
}

export function validateCaptcha(captchaEl) {
  let response = null; // null = widget not loaded, '' = not yet solved
  try {
    response = grecaptcha.getResponse();
  } catch {
    // grecaptcha undefined (blocked/offline) or widget not rendered yet
  }
  const message = response === null ? CAPTCHA_UNAVAILABLE : response ? null : CAPTCHA_UNSOLVED;
  setError(captchaField(captchaEl), message);
  return message ? { message, target: captchaEl } : null;
}

function showErrorSummary(summary, errors) {
  const items = errors.map(({ message, target }) => {
    const link = document.createElement('a');
    link.href = `#${target.id}`;
    link.textContent = message;
    // Anchors scroll but do not focus form controls; do it explicitly.
    link.addEventListener('click', (event) => {
      event.preventDefault();
      target.focus();
      target.scrollIntoView({ block: 'center' });
    });
    const item = document.createElement('li');
    item.append(link);
    return item;
  });
  summary.querySelector('#error-summary-list').replaceChildren(...items);
  summary.hidden = false;
  summary.focus();
}

export function initValidation(form) {
  const summary = document.getElementById('error-summary');
  const captchaEl = document.getElementById('captcha');

  // Globals the reCAPTCHA widget calls (data-callback attributes in markup).
  window.onCaptchaSolved = () => setError(captchaField(captchaEl), null);
  window.onCaptchaExpired = () => setError(captchaField(captchaEl), CAPTCHA_UNSOLVED);

  // Set by script, not markup, so native validation still runs without JS.
  form.noValidate = true;

  Object.keys(rules).forEach((name) => {
    fieldOf(form, name).controls.forEach((el) => {
      // Format feedback on blur when the field has content. "Required" waits
      // for submit so tabbing past a field is not punished.
      el.addEventListener('blur', () => {
        if (el.value.trim() || inError(form, name)) validateField(form, name);
      });
      // Once in error, re-check on every change so the message clears as
      // soon as the user fixes it.
      const live = el.type === 'radio' || el.type === 'file' ? 'change' : 'input';
      el.addEventListener(live, () => {
        if (inError(form, name)) validateField(form, name);
      });
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const errors = [...validateForm(form), validateCaptcha(captchaEl)].filter(Boolean);
    if (errors.length) {
      showErrorSummary(summary, errors);
      return;
    }
    // No backend in this assessment. A real service would POST
    // new FormData(form) here and show the confirmation on success.
    summary.hidden = true;
    form.hidden = true;
    const success = document.getElementById('success-message');
    success.hidden = false;
    success.focus();
  });
}

// ---------------------------------------------------------------------------
// 4. Init – guarded so this module can be imported by Node tests.
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  const form = document.getElementById('hs-form');
  initConditionalFields(form);
  initValidation(form);
}
