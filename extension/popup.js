document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("count");
  browser.runtime.sendMessage({ type: "getCount" }).then(
    (res) => {
      el.textContent = String(res.count);
    },
    () => {
      el.textContent = "—";
    }
  );
});