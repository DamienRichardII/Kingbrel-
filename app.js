const KINGBREL = {
  address: "14 rue Pachot Lainé, Livry Gargan, 93046",
  instagram: "https://www.instagram.com/kingbrel__/",
  tiktok: "https://www.tiktok.com/@kingbrel__",
  phone: "", // optional
  email: "", // optional
};

function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function injectHeaderFooter(){
  const header = document.createElement("header");
  header.className = "header";
  header.innerHTML = `
    <a class="skip" href="#main">Aller au contenu</a>
    <div class="container header__inner">
      <div class="brand" aria-label="Kingbrel">
        <span style="display:none">KINGBREL</span>
      </div>

      <div class="header__center">
        <a href="./index.html" aria-label="Accueil KINGBREL">
          <img class="brand__logo" src="./assets/kingbrel-logo.png" alt="KINGBREL" />
        </a>
        <div class="header__ctaRow">
          <a class="btn btn--primary" href="./reserver.html">Réserver</a>
          <a class="btn btn--ghost" href="./contact.html">Contact</a>
        </div>
      </div>

      <div class="header__right" aria-label="Réseaux sociaux">
        <a class="btn iconBtn" href="${KINGBREL.instagram}" target="_blank" rel="noreferrer" aria-label="Instagram">
          <img class="icon" src="./assets/icon-instagram.svg" alt="" />
        </a>
        <a class="btn iconBtn" href="${KINGBREL.tiktok}" target="_blank" rel="noreferrer" aria-label="TikTok">
          <img class="icon" src="./assets/icon-tiktok.svg" alt="" />
        </a>
      </div>
    </div>
  `;
  const footer = document.createElement("footer");
  footer.className = "footer";
  footer.innerHTML = `
    <div class="container">
      <div class="footerGrid">
        <div>
          <img class="footerLogo" src="./assets/kingbrel-logo.png" alt="KINGBREL" />
          <p style="margin:10px 0 0; color: rgba(255,255,255,.72); line-height:1.6">
            Je te coiffe comme j'aimerais que l'on me coiffe
          </p>
        </div>
        <div>
          <h4 class="footerTitle">Nous trouver</h4>
          <p style="margin:0; color: rgba(255,255,255,.82); line-height:1.6">${KINGBREL.address}</p>
        </div>
        <div>
          <h4 class="footerTitle">Nous contacter</h4>
          <a class="btn btn--primary" href="./contact.html">Accéder à la page contact</a>
          <div style="height:10px"></div>
          <a class="btn" href="./admin.html">Accès admin</a>
        </div>
        <div>
          <h4 class="footerTitle">Nous suivre</h4>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
            <a class="btn iconBtn" href="${KINGBREL.instagram}" target="_blank" rel="noreferrer" aria-label="Instagram">
              <img class="icon" src="./assets/icon-instagram.svg" alt="" />
            </a>
            <a class="btn iconBtn" href="${KINGBREL.tiktok}" target="_blank" rel="noreferrer" aria-label="TikTok">
              <img class="icon" src="./assets/icon-tiktok.svg" alt="" />
            </a>
          </div>
        </div>
      </div>

      <div class="footerSmall">
        <span>© <span id="year"></span> KINGBREL</span>
        <span style="display:flex; gap:12px; flex-wrap:wrap">
          <a href="./mentions-legales.html">Mentions légales</a>
          <a href="./cookies.html">Gestion des cookies</a>
        </span>
      </div>
    </div>
  `;
  document.body.prepend(header);
  document.body.append(footer);
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
}

function pageEnter(){
  // Smooth "Apple-like" entrance
  document.documentElement.style.scrollBehavior = "smooth";
  document.body.animate(
    [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
  );
}

function toast(msg){
  let t = $("#toast");
  if (!t){
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=> t.classList.remove("show"), 2600);
}

function setLightThemeIfNeeded(){
  // Pages can opt-in by adding data-theme="light" on body.
  const theme = document.body.getAttribute("data-theme");
  if (theme === "light") document.body.classList.add("light");
}

document.addEventListener("DOMContentLoaded", ()=>{
  injectHeaderFooter();
  setLightThemeIfNeeded();
  pageEnter();

  // Parallax micro effect on hero background
  const heroMedia = document.querySelector(".heroMedia");
  if (heroMedia){
    window.addEventListener("mousemove", (e)=>{
      const x = (e.clientX / window.innerWidth - .5) * 6;
      const y = (e.clientY / window.innerHeight - .5) * 6;
      heroMedia.style.transform = `scale(1.06) translate(${x}px, ${y}px)`;
    }, { passive:true });
  }
});

export { KINGBREL, $, $all, toast };
