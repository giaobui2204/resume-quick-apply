import { discoverFields, fillField, type FieldMatch } from "./field-mapper";
import { loadVerifiedProfile } from "./profile-storage";

let matches: FieldMatch[] = [];

async function mount() {
  if (document.querySelector("#applypilot-panel")) return;
  const profile = await loadVerifiedProfile();
  matches = profile?.verifiedAt ? discoverFields(profile) : [];
  const captcha = Boolean(
    document.querySelector('[class*="captcha" i], iframe[src*="captcha" i], [data-sitekey]')
  );
  const panel = document.createElement("aside");
  panel.id = "applypilot-panel";
  panel.innerHTML = `
    <style>
      #applypilot-panel { all: initial; position: fixed; z-index: 2147483647; right: 18px; bottom: 18px; width: 300px; font-family: system-ui,sans-serif; color: #15221d; background: #fbfaf6; border: 1px solid #cbd0c8; box-shadow: 0 16px 50px rgba(20,34,29,.22); border-radius: 7px; overflow: hidden; }
      #applypilot-panel * { box-sizing: border-box; }
      #applypilot-panel header { background: #15221d; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
      #applypilot-panel header strong { color: #cde566; font-size: 14px; }
      #applypilot-panel header button { border: 0; background: transparent; color: white; cursor: pointer; }
      #applypilot-panel main { padding: 15px; }
      #applypilot-panel p { font-size: 11px; line-height: 1.5; margin: 0 0 12px; color: #63706a; }
      #applypilot-panel .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin: 12px 0; }
      #applypilot-panel .summary span { padding: 8px; background: #eceee8; font-size: 9px; text-align: center; }
      #applypilot-panel .warning { padding: 9px; background: #f8e6dc; color: #8f432b; font-size: 10px; margin-bottom: 10px; }
      #applypilot-panel .safe { padding: 9px; background: #e4efe1; color: #39704d; font-size: 10px; margin-bottom: 10px; }
      #applypilot-panel .action { display: block; width: 100%; border: 0; background: #cde566; color: #15221d; padding: 10px; font-weight: 800; font-size: 11px; border-radius: 3px; cursor: pointer; }
      #applypilot-panel .action:disabled { opacity: .45; cursor: not-allowed; }
      [data-applypilot-filled=true] { outline: 2px solid #8fad39 !important; background: #f4f9df !important; }
    </style>
    <header><strong>ApplyPilot</strong><button id="applypilot-close" aria-label="Close">×</button></header>
    <main>
      ${!profile?.verifiedAt ? '<div class="warning">Open the extension and save your verified profile first.</div>' : ""}
      ${captcha ? '<div class="warning">CAPTCHA detected. ApplyPilot will not bypass it. Continue manually.</div>' : '<div class="safe">Final submission stays under your control.</div>'}
      <p>Only exact verified fields will be filled. Existing answers and protected demographic or legal fields are left untouched.</p>
      <div class="summary"><span>${matches.filter((m) => m.value).length} matched</span><span>${matches.filter((m) => !m.value || m.protected).length} need review</span></div>
      <button class="action" id="applypilot-fill" ${!profile?.verifiedAt || captcha ? "disabled" : ""}>Fill verified fields</button>
    </main>`;
  document.body.appendChild(panel);
  panel.querySelector("#applypilot-close")?.addEventListener("click", () => panel.remove());
  panel.querySelector("#applypilot-fill")?.addEventListener("click", () => {
    const count = matches.filter(fillField).length;
    const button = panel.querySelector<HTMLButtonElement>("#applypilot-fill");
    if (button) {
      button.textContent = `${count} fields filled · Review before submit`;
      button.disabled = true;
    }
  });
}

void mount();
