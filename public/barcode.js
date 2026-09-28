export function normalizeBarcode(value) {
  const code = String(value || "").replace(/[\s-]/g, "");
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) throw Error("Enter the 8, 12, 13 or 14 digits printed below the barcode.");
  let total = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) total += Number(code[i]) * weight;
  if ((10 - total % 10) % 10 !== Number(code.at(-1))) throw Error("The barcode check digit does not match. Check the number or try a clearer photo.");
  return code;
}
