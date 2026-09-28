export function mountProfileValidation(form) {
  let attempted = false;
  const fields = [...form.querySelectorAll("input[required],select[required]")];
  const summary = form.ownerDocument.createElement("p");
  summary.className = "profile-validation-summary";
  summary.setAttribute("role", "status");
  summary.hidden = true;
  form.querySelector("button[type=submit]").before(summary);
  const errors = new Map();
  for (const field of fields) {
    const error = form.ownerDocument.createElement("span");
    error.id = `${field.id}-error`; error.className = "profile-field-error"; error.hidden = true;
    field.after(error); errors.set(field, error);
    field.setAttribute("aria-describedby", [field.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
  }
  function message(field) {
    if (field.disabled) return "";
    if (!field.value.trim()) return "This field is required.";
    if (field.type === "number") {
      const value = Number(field.value);
      if (!Number.isFinite(value)) return "Enter a valid number.";
      if (field.min !== "" && value < Number(field.min)) return `Enter ${field.min} or more.`;
      if (field.max !== "" && value > Number(field.max)) return `Enter ${field.max} or less.`;
    }
    return field.validity.valid ? "" : field.validationMessage;
  }
  function validate(show = attempted) {
    const invalid = fields.map(field => [field, message(field)]).filter(([, error]) => error);
    if (show) {
      for (const field of fields) {
        const text = message(field); const error = errors.get(field);
        error.textContent = text; error.hidden = !text;
        if (text) field.setAttribute("aria-invalid", "true"); else field.removeAttribute("aria-invalid");
      }
      summary.hidden = !invalid.length;
      summary.textContent = invalid.length ? `Check ${invalid.length} highlighted ${invalid.length === 1 ? "field" : "fields"} to continue.` : "";
    }
    return invalid;
  }
  form.noValidate = true;
  return {
    refresh: () => validate(),
    submit() {
      attempted = true;
      const invalid = validate(true);
      if (!invalid.length) return true;
      const field = invalid.find(([candidate]) => !candidate.readOnly)?.[0];
      if (!field) { summary.textContent = "Daily targets could not be calculated. Check your profile or use Edit to adjust your targets."; summary.tabIndex = -1; summary.focus(); return false; }
      // Custom goals can be collapsed; expose their editor before focusing.
      const editor = field.closest("#goalEditor");
      if (editor) { editor.hidden = false; editor.style.display = "grid"; field.readOnly = false; }
      field.focus(); field.scrollIntoView({ block: "center", behavior: "instant" });
      return false;
    },
  };
}
