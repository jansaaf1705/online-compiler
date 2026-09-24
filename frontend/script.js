// Point this to your backend URL when deployed elsewhere.
const API_BASE = "http://localhost:5000";

const LANGUAGE_CONFIG = {
  python: { monacoLang: "python", boilerplate: 'print("Hello, World!")\n' },
  javascript: { monacoLang: "javascript", boilerplate: 'console.log("Hello, World!");\n' },
  c: {
    monacoLang: "c",
    boilerplate:
      '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n',
  },
  cpp: {
    monacoLang: "cpp",
    boilerplate:
      '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
  },
  java: {
    monacoLang: "java",
    boilerplate:
      'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  },

  sql: {
    monacoLang: "sql",
    boilerplate:
      "CREATE TABLE users (id INTEGER, name TEXT);\nINSERT INTO users VALUES (1, 'Alice'), (2, 'Bob');\nSELECT * FROM users;\n",
  },
};

let editor;
let currentLanguage = "python";

const languageSelect = document.getElementById("languageSelect");
const runBtn = document.getElementById("runBtn");
const stdinBox = document.getElementById("stdinBox");
const outputBox = document.getElementById("outputBox");
const statusText = document.getElementById("statusText");

async function loadLanguages() {
  // Populate from our known config immediately so the UI isn't blocked
  // on the network; then reconcile with the backend's supported list.
  Object.keys(LANGUAGE_CONFIG).forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    languageSelect.appendChild(opt);
  });

  try {
    const res = await fetch(`${API_BASE}/api/languages`);
    const data = await res.json();
    languageSelect.innerHTML = "";
    data.languages.forEach(({ id, label }) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      languageSelect.appendChild(opt);
    });
    languageSelect.value = currentLanguage;
  } catch (err) {
    setStatus("Could not reach backend for language list — using defaults.", true);
  }
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.background = isError ? "#c0392b" : "";
}

require.config({
  paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.49.0/min/vs" },
});

require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: LANGUAGE_CONFIG[currentLanguage].boilerplate,
    language: LANGUAGE_CONFIG[currentLanguage].monacoLang,
    theme: "vs-dark",
    fontSize: 14,
    automaticLayout: true,
    minimap: { enabled: false },
  });

  loadLanguages();

  languageSelect.addEventListener("change", (e) => {
    currentLanguage = e.target.value;
    const config = LANGUAGE_CONFIG[currentLanguage] || { monacoLang: "plaintext", boilerplate: "" };
    monaco.editor.setModelLanguage(editor.getModel(), config.monacoLang);
    editor.setValue(config.boilerplate);
  });

  runBtn.addEventListener("click", runCode);

  // Ctrl/Cmd + Enter to run
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
});

async function runCode() {
  const code = editor.getValue();
  const input = stdinBox.value;

  if (!code.trim()) {
    setStatus("Nothing to run — write some code first.", true);
    return;
  }

  runBtn.disabled = true;
  setStatus("Running...");
  outputBox.classList.remove("error");
  outputBox.textContent = "Running...";

  try {
    const res = await fetch(`${API_BASE}/api/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: currentLanguage, code, input }),
    });

    const data = await res.json();

    if (!res.ok) {
      outputBox.classList.add("error");
      outputBox.textContent = data.error || "Something went wrong.";
      setStatus("Error", true);
      return;
    }

    const combined = [data.stdout, data.stderr].filter(Boolean).join("\n");
    outputBox.textContent = combined || "(No output)";
    if (data.stderr) outputBox.classList.add("error");

    if (data.timedOut) {
      setStatus("Execution timed out", true);
    } else {
      setStatus(`Finished in ${data.durationMs}ms (exit code ${data.exitCode})`, !!data.stderr);
    }
  } catch (err) {
    outputBox.classList.add("error");
    outputBox.textContent = "Could not reach the backend. Is the server running?";
    setStatus("Network error", true);
  } finally {
    runBtn.disabled = false;
  }
}
