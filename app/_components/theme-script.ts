// Runs before first paint (injected as an inline <script>). Keep it tiny and
// dependency-free — it executes as a raw string, not a module.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("scrummy-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default THEME_SCRIPT;
