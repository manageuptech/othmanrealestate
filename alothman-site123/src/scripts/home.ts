import { gsap, ScrollTrigger, reduce } from './core';
import { skyline } from './skyline';

/* ---------- hero background: video if available, generative skyline otherwise ---------- */
const canvas = document.querySelector<HTMLCanvasElement>('.hero__canvas');
const sky = canvas ? skyline(canvas, { reduce }) : null;

const video = document.querySelector<HTMLVideoElement>('.hero__video');
const vbtn = document.querySelector<HTMLButtonElement>('[data-vplay]');
if (video) {
  let src = video.dataset.src!;
  if (src.endsWith('.mp4') && video.canPlayType('video/webm; codecs="vp9"') === 'probably' && !video.canPlayType('video/mp4; codecs="avc1.42E01E"')) src = src.replace(/\.mp4$/, '.webm');
  const conn = (navigator as any).connection;
  const saveData = conn?.saveData || /2g/.test(conn?.effectiveType || '');
  if (!saveData && !reduce) {
    video.src = src;
    video.addEventListener('canplay', () => {
      video.play().then(() => { video.classList.add('is-ready'); sky?.pause(); }).catch(() => {});
    }, { once: true });
    video.addEventListener('error', () => vbtn?.parentElement?.remove(), { once: true });
  } else vbtn?.parentElement?.remove();
  vbtn?.addEventListener('click', () => {
    if (video.paused) { video.play(); vbtn.setAttribute('aria-label', 'إيقاف الفيديو مؤقتًا'); vbtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 5v14M16 5v14"/></svg>'; }
    else { video.pause(); vbtn.setAttribute('aria-label', 'تشغيل الفيديو'); vbtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>'; }
  });
}

/* ---------- intro: preloader → hero reveal ---------- */
const pre = document.querySelector<HTMLElement>('.pre');
const heroWords = document.querySelectorAll<HTMLElement>('.hero__line > span');
const heroRest = document.querySelectorAll<HTMLElement>('.hero__eyebrow, .hero__sub, .sp, .hero__aside, .hdr');

function heroIn(delay = 0) {
  if (reduce) return;
  const tl = gsap.timeline({ delay });
  tl.from('.hero__stage', { scale: 1.18, duration: 2.4, ease: 'expo.out' }, 0)
    .from(heroWords, { yPercent: 120, rotate: 5, duration: 1.4, ease: 'expo.out', stagger: 0.12 }, 0.15)
    .from(heroRest, { y: 30, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }, 0.45);
}

let seen = false;
try { seen = sessionStorage.getItem('ao-intro') === '1'; sessionStorage.setItem('ao-intro', '1'); } catch {}

if (pre && !seen && !reduce) {
  document.documentElement.style.overflow = 'hidden';
  const num = pre.querySelector('span')!;
  const o = { v: 0 };
  const tl = gsap.timeline({ onComplete: () => { pre.remove(); document.documentElement.style.overflow = ''; ScrollTrigger.refresh(); } });
  tl.from('.pre__center img', { scale: .6, autoAlpha: 0, duration: 1, ease: 'expo.out' })
    .to('.pre__ring circle', { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' }, 0.1)
    .to(o, { v: 100, duration: 1.6, ease: 'power2.inOut', onUpdate: () => (num.textContent = String(Math.round(o.v))) }, 0.1)
    .from('.pre__name', { y: 20, autoAlpha: 0, duration: .8, ease: 'expo.out' }, 0.3)
    .to('.pre__center, .pre__count, .pre__name', { autoAlpha: 0, y: -30, duration: .6, ease: 'power3.in' }, '+=0.15')
    .to('.pre__panel', { yPercent: -100, duration: 1.1, ease: 'expo.inOut', stagger: 0.09 }, '-=0.1')
    .add(() => heroIn(0), '-=1.0');
} else {
  pre?.classList.add('is-skip');
  pre?.remove();
  heroIn(0.05);
}

/* ---------- hero: media shrinks into a framed window on scroll ---------- */
if (!reduce) {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    gsap.to('.hero__stage', {
      clipPath: 'inset(6% 4% 0% 4% round 32px)', ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero__content', { yPercent: -18, autoAlpha: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: true } });
  });
}

/* ---------- about: words light up as you read ---------- */
const about = document.querySelector<HTMLElement>('[data-words]');
if (about) {
  about.innerHTML = (about.textContent || '').trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');
  const ws = about.querySelectorAll<HTMLElement>('.w');
  if (reduce) ws.forEach((w) => (w.style.opacity = '1'));
  else gsap.to(ws, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: about, start: 'top 80%', end: 'bottom 45%', scrub: true } });
}

/* ---------- types: pinned horizontal scroll + line drawings ---------- */
const track = document.querySelector<HTMLElement>('.types__track');
if (track && !reduce) {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    const panels = track.querySelectorAll<HTMLElement>('.tpanel');
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    // RTL: track starts on the right, so it moves to the right (positive x)
    const tween = gsap.to(track, {
      x: () => dist(), ease: 'none',
      scrollTrigger: {
        trigger: '.types', pin: '.types__pin', start: 'top top', end: () => `+=${dist() + window.innerHeight * 0.4}`, scrub: 0.8, invalidateOnRefresh: true,
        onUpdate: (st) => gsap.set('.types__progress i', { scaleX: st.progress }),
      },
    });
    const draw = () => panels.forEach((p) => {
      const r = p.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, r.right / (window.innerWidth * 0.75)));
      p.style.setProperty('--draw', String(1 - t));
    });
    tween.scrollTrigger?.vars && ScrollTrigger.addEventListener('refresh', draw);
    gsap.ticker.add(draw);
    draw();
    return () => gsap.ticker.remove(draw);
  });
  mm.add('(max-width: 760px)', () => {
    track.querySelectorAll<HTMLElement>('.tpanel').forEach((p) => {
      gsap.fromTo(p, { '--draw': 1 }, { '--draw': 0, duration: 2.2, ease: 'power2.out', scrollTrigger: { trigger: p, start: 'top 85%', once: true } });
    });
  });
}

window.addEventListener('pagehide', () => sky?.destroy());
