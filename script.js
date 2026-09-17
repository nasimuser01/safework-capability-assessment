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
// 3. Form validation wiring
// ---------------------------------------------------------------------------
// TODO: step 6


// ---------------------------------------------------------------------------
// 4. Init – guarded so this module can be imported by Node tests.
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  const form = document.getElementById('hs-form');
  initConditionalFields(form);
}
