// ===========================================================================
// SafeWork NSW Capability Assessment – form behaviour
//
// Organised top-to-bottom:
//   1. Validators  – pure functions, no DOM, unit-tested in test/
//   2. Conditional fields
//   3. Form validation wiring
//   4. Init (browser only)
// ===========================================================================


// ---------------------------------------------------------------------------
// 1. Validators
// Each validator is a pure predicate: (value) => boolean. Keeping them free of
// DOM access means they can be unit-tested with `npm test` and reused
// server-side if the form is ever submitted to an API.
// ---------------------------------------------------------------------------

export const patterns = {
  // Characters people legitimately type into a phone field but which carry no
  // meaning: spaces, hyphens, dots and parentheses, e.g. "(02) 9876-5432".
  phoneNoise: /[\s().-]/g,

  // Australian phone number, applied AFTER noise is stripped:
  //   (?:\+?61|0)[2-578]\d{8}  landline (02/03/07/08) or mobile (04/05),
  //                             written locally (0…) or internationally (+61…)
  //   1[38]00\d{6}              1300 / 1800 numbers
  //   13\d{4}                   six-digit 13 numbers
  auPhone: /^(?:(?:\+?61|0)[2-578]\d{8}|1[38]00\d{6}|13\d{4})$/,

  // Email: RFC 5322 "dot-atom" local part, then a domain of one or more
  // labels (letters/digits, optional internal hyphens, max 63 chars) and at
  // least one dot. Deliberately stricter than the HTML spec, which allows
  // "a@b" with no TLD.
  email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,

  // ABN: 11 digits, first digit never 0, optionally grouped 2-3-3-3 with
  // single spaces as printed by the ATO, e.g. "51 824 753 556".
  abn: /^[1-9]\d ?\d{3} ?\d{3} ?\d{3}$/,

  // Accepted policy document types, matched on the file extension. MIME types
  // reported by browsers are inconsistent (often empty on Windows), so the
  // extension is the reliable signal client-side.
  policyFile: /\.(pdf|docx?)$/i,
};

// ABN weighting factors published by the Australian Business Register.
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const validators = {
  required(value) {
    return typeof value === 'string' && value.trim().length > 0;
  },

  auPhone(value) {
    return patterns.auPhone.test(value.trim().replace(patterns.phoneNoise, ''));
  },

  email(value) {
    return patterns.email.test(value.trim());
  },

  // Format only – "is this shaped like an ABN?"
  abnFormat(value) {
    return patterns.abn.test(value.trim());
  },

  // Checksum – "is this a real ABN?" Uses the ABR modulus-89 algorithm:
  // subtract 1 from the first digit, multiply each digit by its weight, and
  // the sum must divide by 89. Catches typos the format check cannot.
  abnChecksum(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    const sum = ABN_WEIGHTS.reduce((total, weight, i) => {
      const digit = Number(digits[i]) - (i === 0 ? 1 : 0);
      return total + digit * weight;
    }, 0);
    return sum % 89 === 0;
  },

  // `file` is a File-like object: { name, size }.
  policyFileType(file) {
    return Boolean(file) && patterns.policyFile.test(file.name);
  },

  policyFileSize(file) {
    return Boolean(file) && file.size <= MAX_FILE_BYTES;
  },
};


// ---------------------------------------------------------------------------
// 2. Conditional fields
// A panel declares what it depends on in markup:
//   <div data-conditional-for="policy" data-conditional-value="yes">
// and is shown only while that named control has that value. Nothing here
// knows about specific fields, so adding another conditional question is a
// markup-only change.
// ---------------------------------------------------------------------------

const FIELD_SELECTOR = 'input, select, textarea';

function setPanelVisible(panel, visible) {
  panel.hidden = !visible;

  panel.querySelectorAll(FIELD_SELECTOR).forEach((field) => {
    // Disabled fields are neither validated nor submitted, so a hidden
    // answer can never leak into the submission. Values are kept, so an
    // accidental "No" then "Yes" does not throw away an uploaded file.
    field.disabled = !visible;
    // Only mandatory while visible (data-required marks which ones).
    field.required = visible && field.hasAttribute('data-required');
  });
}

export function initConditionalFields(form) {
  form.querySelectorAll('[data-conditional-for]').forEach((panel) => {
    const { conditionalFor: name, conditionalValue: expected } = panel.dataset;
    const controls = [...form.querySelectorAll(`[name="${name}"]`)];
    // The control that reveals the panel gets disclosure semantics so screen
    // readers announce "expanded"/"collapsed" as it changes.
    const trigger = controls.find((c) => c.value === expected);
    if (trigger) trigger.setAttribute('aria-controls', panel.id);

    const update = () => {
      const visible = form.elements[name].value === expected;
      setPanelVisible(panel, visible);
      if (trigger) trigger.setAttribute('aria-expanded', String(visible));
    };

    controls.forEach((c) => c.addEventListener('change', update));
    update(); // apply initial state (also handles browser-restored answers)
  });
}


// ---------------------------------------------------------------------------
// 3. Form validation
// Rules are data: field name -> ordered list of { test, message }. The first
// failing rule wins, so messages progress from "you missed this" to "this is
// in the wrong format" to "this looks wrong". Adding a field means adding an
// entry here; the DOM code below is generic.
// ---------------------------------------------------------------------------

// Wraps a format validator so an empty value passes (the field is optional).
const optional = (test) => (value) => !validators.required(value) || test(value);

const fileRequired = (file) => Boolean(file);

const PHONE_MESSAGE =
  'Enter an Australian phone number, like 0412 345 678 or 02 9876 5432';

export const rules = {
  phone: [{ test: optional(validators.auPhone), message: PHONE_MESSAGE }],
  email: [
    { test: validators.required, message: 'Enter your email address' },
    {
      test: validators.email,
      message: 'Enter an email address in the correct format, like name@example.com',
    },
  ],
  abn: [
    { test: validators.required, message: 'Enter your ABN' },
    {
      test: validators.abnFormat,
      message: 'ABN must be 11 digits, like 51 824 753 556',
    },
    {
      test: validators.abnChecksum,
      message: 'This ABN is not valid. Check the digits and try again',
    },
  ],
  policy: [
    {
      test: validators.required,
      message: 'Select yes if your company has a health and safety policy',
    },
  ],
  'policy-file': [
    { test: fileRequired, message: 'Attach a copy of your health and safety policy' },
    {
      test: validators.policyFileType,
      message: 'The policy must be a PDF or Word document (.pdf, .doc or .docx)',
    },
    { test: validators.policyFileSize, message: 'The policy must be 5 MB or smaller' },
  ],
  hsr: [
    {
      test: validators.required,
      message: 'Select yes if your company has a health and safety representative',
    },
  ],
  'hsr-name': [
    {
      test: validators.required,
      message: 'Enter the name of your health and safety representative',
    },
  ],
  'hsr-phone': [{ test: optional(validators.auPhone), message: PHONE_MESSAGE }],
};

// Pure: returns the first failing rule's message, or null when valid.
export function firstError(fieldRules, value) {
  const failed = fieldRules.find((rule) => !rule.test(value));
  return failed ? failed.message : null;
}

// --- DOM helpers -----------------------------------------------------------

// form.elements[name] is a single element, or a RadioNodeList for radios.
const isRadioGroup = (control) => control instanceof RadioNodeList;

function controlsOf(control) {
  return isRadioGroup(control) ? [...control] : [control];
}

function valueOf(control) {
  if (isRadioGroup(control)) return control.value;
  if (control.type === 'file') return control.files[0];
  return control.value;
}

// The element that receives focus from an error-summary link.
function focusTargetOf(control) {
  return controlsOf(control)[0];
}

// Radio questions are a fieldset.form__group; other fields sit inside one.
function groupOf(control) {
  return focusTargetOf(control).closest('.form__group');
}

function errorElementOf(form, name) {
  return form.querySelector(`#${name}-error`);
}

function showError(form, name, message) {
  const control = form.elements[name];
  const errorEl = errorElementOf(form, name);
  errorEl.replaceChildren();
  // Prefix announced to screen readers only; sighted users see the red style.
  const prefix = document.createElement('span');
  prefix.className = 'visually-hidden';
  prefix.textContent = 'Error: ';
  errorEl.append(prefix, message);
  errorEl.hidden = false;
  groupOf(control).classList.add('form__group--error');
  controlsOf(control).forEach((el) => el.setAttribute('aria-invalid', 'true'));
}

function clearError(form, name) {
  const control = form.elements[name];
  const errorEl = errorElementOf(form, name);
  errorEl.hidden = true;
  errorEl.replaceChildren();
  groupOf(control).classList.remove('form__group--error');
  controlsOf(control).forEach((el) => el.removeAttribute('aria-invalid'));
}

function hasError(form, name) {
  return !errorElementOf(form, name).hidden;
}

// Validates one field, updates its inline error, returns the message or null.
export function validateField(form, name) {
  const control = form.elements[name];
  // Fields inside a hidden conditional panel are disabled: skip them.
  if (controlsOf(control).every((el) => el.disabled)) {
    clearError(form, name);
    return null;
  }
  const message = firstError(rules[name], valueOf(control));
  if (message) showError(form, name, message);
  else clearError(form, name);
  return message;
}

// Validates every ruled field in document order; returns [{ name, message }].
export function validateForm(form) {
  const seen = new Set();
  const errors = [];
  for (const el of form.elements) {
    const { name } = el;
    if (!name || !rules[name] || seen.has(name)) continue;
    seen.add(name);
    const message = validateField(form, name);
    if (message) errors.push({ name, message });
  }
  return errors;
}

// --- Error summary ---------------------------------------------------------

function renderErrorSummary(form, summary, errors) {
  const list = summary.querySelector('#error-summary-list');
  list.replaceChildren(
    ...errors.map(({ name, message }) => {
      const target = focusTargetOf(form.elements[name]);
      const link = document.createElement('a');
      link.href = `#${target.id}`;
      link.textContent = message;
      // Anchors scroll but do not focus form controls; do it explicitly so
      // keyboard and screen-reader users land on the field.
      link.addEventListener('click', (event) => {
        event.preventDefault();
        target.focus();
        target.scrollIntoView({ block: 'center' });
      });
      const item = document.createElement('li');
      item.append(link);
      return item;
    }),
  );
  summary.hidden = false;
  summary.focus();
}

// --- Wiring ----------------------------------------------------------------

export function initValidation(form, { onValid }) {
  const summary = document.getElementById('error-summary');

  // Our messages replace the browser's bubbles. Set here rather than in the
  // markup so native validation still runs if this script fails to load.
  form.noValidate = true;

  Object.keys(rules).forEach((name) => {
    controlsOf(form.elements[name]).forEach((el) => {
      // Format feedback when leaving a field that has content. "Required"
      // errors wait for submit so tabbing past a field is not punished.
      el.addEventListener('blur', () => {
        if (validators.required(el.value) || hasError(form, name)) {
          validateField(form, name);
        }
      });
      // While a field is in error, re-check on every change so the message
      // clears the moment the user fixes it.
      const liveEvent = el.type === 'radio' || el.type === 'file' ? 'change' : 'input';
      el.addEventListener(liveEvent, () => {
        if (hasError(form, name)) validateField(form, name);
      });
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const errors = validateForm(form);
    if (errors.length) {
      renderErrorSummary(form, summary, errors);
      return;
    }
    summary.hidden = true;
    onValid(form);
  });
}


// ---------------------------------------------------------------------------
// 4. Init – guarded so this module can be imported by Node tests.
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  const form = document.getElementById('hs-form');
  initConditionalFields(form);
  initValidation(form, {
    onValid(validForm) {
      // No backend in this assessment: show confirmation and reset. A real
      // service would POST FormData(validForm) here.
      const success = document.getElementById('success-message');
      validForm.hidden = true;
      success.hidden = false;
      success.focus();
    },
  });
}
