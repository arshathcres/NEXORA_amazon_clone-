import { adminApi } from "./adminApi.js";

const input = document.querySelector("#product-images");
const preview = document.querySelector("#image-preview");
const status = document.querySelector("#image-upload-status");
const form = document.querySelector("#product-image-upload-form");
const productIdField = document.querySelector("#product-id");
const primaryImageIdField = document.querySelector("#primary-image-id");
const uploadButton = form?.querySelector('button[type="submit"]');
let selectedFiles = [];

function tell(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = isError ? "error" : "success";
}

function renderPreview() {
  if (!preview) return;
  preview.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const card = document.createElement("figure");
    card.className = "image-preview-card";
    const image = document.createElement("img");
    image.alt = `Selected product image ${index + 1}: ${file.name}`;
    image.src = URL.createObjectURL(file);
    image.onload = () => URL.revokeObjectURL(image.src);
    const caption = document.createElement("figcaption");
    caption.textContent = `${file.name}${index === 0 ? " · first upload becomes primary if none exists" : ""}`;
    card.append(image, caption);
    preview.append(card);
  });
}

input?.addEventListener("change", () => {
  selectedFiles = Array.from(input.files || []).slice(0, 8);
  if (input.files?.length > 8) tell("Choose up to 8 images per upload.", true);
  else tell("");
  renderPreview();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const productId = productIdField?.value.trim();
  if (!productId || !/^[1-9][0-9]*$/.test(productId)) {
    tell("Enter a valid product ID first.", true);
    productIdField?.focus();
    return;
  }
  if (!selectedFiles.length) {
    tell("Choose at least one image to upload.", true);
    input?.focus();
    return;
  }
  if (uploadButton) uploadButton.disabled = true;
  tell("Uploading images…");
  try {
    const result = await adminApi.uploadProductImages(productId, selectedFiles);
    tell(`${result.images.length} image${result.images.length === 1 ? "" : "s"} uploaded successfully.`);
    const requestedPrimaryId = primaryImageIdField?.value.trim();
    if (requestedPrimaryId && result.images.length) {
      const selected = result.images.find((image) => image.id === requestedPrimaryId);
      if (selected) await adminApi.setPrimaryImage(productId, selected.id);
    }
    selectedFiles = [];
    if (input) input.value = "";
    if (primaryImageIdField) primaryImageIdField.value = "";
    renderPreview();
  } catch (error) {
    tell(error.message || "Image upload failed.", true);
  } finally {
    if (uploadButton) uploadButton.disabled = false;
  }
});
