import { authApi } from "./authApi.js";

const form = document.querySelector("#auth-form");
const message = document.querySelector("#form-message");
const submitButton = form?.querySelector('button[type="submit"]');

function showMessage(text, success = false) {
  message.textContent = text;
  message.hidden = false;
  message.classList.toggle("success", success);
}

function formValues() {
  return Object.fromEntries(new FormData(form).entries());
}

if (form && message && submitButton) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.hidden = true;

    if (!form.reportValidity()) return;

    const values = formValues();
    const mode = form.dataset.mode;
    submitButton.disabled = true;
    submitButton.textContent = mode === "register" ? "Creating account…" : "Signing in…";

    try {
      if (mode === "register") {
        await authApi.register({ full_name: values.full_name.trim(), email: values.email.trim(), password: values.password });
      } else {
        await authApi.login({ email: values.email.trim(), password: values.password });
      }
      showMessage("Success. Your account session is ready.", true);
      window.location.assign("../index.html");
    } catch (error) {
      showMessage(error.message || "Something went wrong. Please try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = mode === "register" ? 'Create account <span aria-hidden="true">→</span>' : 'Sign in <span aria-hidden="true">→</span>';
    }
  });
}
