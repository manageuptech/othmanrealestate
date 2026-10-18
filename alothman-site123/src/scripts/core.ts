import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- smooth scroll ---------- */
export let lenis: Lenis | null = null;
if (!reduce) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
(window as any).__lenis = lenis;

/* ---------- header: solid on scroll, hide on scroll down ---------- */
const hdr = document.querySelector<HTMLElement>('.hdr');
let lastY = 0;
const onScroll = () => {
  const y = window.scrollY;
  if (hdr) {
    if (!hdr.dataset.solid) hdr.classList.toggle('is-solid', y > 40);
    hdr.classList.toggle('is-hidden', y > 300 && y > lastY + 4 && !document.body.classList.contains('menu-open') && !document.querySelector('.dd.is-open'));
    if (y < lastY - 4) hdr.classList.remove('is-hidden');
  }
  lastY = y;
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- mobile menu ---------- */
const menu = document.getElementById('mmenu');
const openBtn = document.querySelector<HTMLButtonElement>('[data-menu-open]');
const closeBtn = document.querySelector<HTMLButtonElement>('[data-menu-close]');
const setMenu = (open: boolean) => {
  menu?.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
  openBtn?.setAttribute('aria-expanded', String(open));
  if (open) { lenis?.stop(); closeBtn?.focus(); } else { lenis?.start(); }
};
openBtn?.addEventListener('click', () => setMenu(true));
closeBtn?.addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu?.classList.contains('is-open')) setMenu(false); });
menu?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

/* ---------- image fallback: show line-art when a photo can't load ---------- */
const fail = (img: HTMLImageElement) => { img.style.opacity = '0'; img.closest('[data-media]')?.classList.add('is-missing'); };
document.querySelectorAll<HTMLImageElement>('img[data-photo]').forEach((img) => {
  if (img.complete && img.naturalWidth === 0) fail(img);
  img.addEventListener('error', () => fail(img), { once: true });
});

/* ---------- split headings into lines of words ---------- */
export function splitWords(el: HTMLElement) {
  if (el.dataset.splitDone) return el.querySelectorAll<HTMLElement>('.split-line > span');
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return (node.textContent || '').split(/(\s+)/).map((w) => (/^\s+$/.test(w) || !w ? w : `<span class="split-line"><span>${w}</span></span>`)).join('');
    if (node instanceof HTMLBRElement) return '<br>';
    if (node instanceof HTMLElement) { const c = node.cloneNode(false) as HTMLElement; c.innerHTML = Array.from(node.childNodes).map(walk).join(''); return c.outerHTML; }
    return '';
  };
  el.innerHTML = Array.from(el.childNodes).map(walk).join('');
  el.dataset.splitDone = '1';
  return el.querySelectorAll<HTMLElement>('.split-line > span');
}
document.querySelectorAll<HTMLElement>('.split-line').forEach((l) => (l.style.display = 'inline-block'));

if (!reduce) {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const words = splitWords(el);
    el.querySelectorAll<HTMLElement>('.split-line').forEach((l) => (l.style.display = 'inline-block'));
    gsap.set(words, { yPercent: 110, rotate: -4 });
    ScrollTrigger.create({
      trigger: el, start: 'top 88%', once: true,
      onEnter: () => gsap.to(words, { yPercent: 0, rotate: 0, duration: 1.3, ease: 'expo.out', stagger: 0.06, delay: parseFloat(el.dataset.delay || '0') }),
    });
  });
}

/* ---------- reveal on scroll ---------- */
// clip-path hides an element from IntersectionObserver, so clip reveals watch their parent
const watched = new Map<Element, Element[]>();
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    (watched.get(e.target) || []).forEach((el) => el.classList.add('is-in'));
    watched.delete(e.target); io.unobserve(e.target);
  });
}, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
document.querySelectorAll('[data-reveal]').forEach((el) => {
  const target = el.getAttribute('data-reveal') === 'clip' ? el.parentElement || el : el;
  if (!watched.has(target)) { watched.set(target, []); io.observe(target); }
  watched.get(target)!.push(el);
});

/* ---------- parallax images ---------- */
if (!reduce) {
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const amt = parseFloat(el.dataset.parallax || '12');
    gsap.fromTo(el, { yPercent: -amt }, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

/* ---------- counters ---------- */
document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
  const to = parseFloat(el.dataset.count || '0');
  if (reduce) { el.textContent = String(to); return; }
  ScrollTrigger.create({
    trigger: el, start: 'top 90%', once: true,
    onEnter: () => { const o = { v: 0 }; gsap.to(o, { v: to, duration: 2.4, ease: 'power3.out', onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString('en-US')) }); },
  });
});

/* ---------- custom cursor + magnetic buttons (desktop only) ---------- */
if (fine && !reduce) {
  const cur = document.querySelector<HTMLElement>('.cursor');
  if (cur) {
    const dot = cur.querySelector<HTMLElement>('.cursor__dot')!;
    const ring = cur.querySelector<HTMLElement>('.cursor__ring')!;
    const label = cur.querySelector<HTMLElement>('.cursor__label')!;
    const rx = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
    window.addEventListener('pointermove', (e) => { gsap.set(dot, { x: e.clientX, y: e.clientY }); rx(e.clientX); ry(e.clientY); }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const t = e.target as HTMLElement;
      const view = t.closest<HTMLElement>('[data-cursor]');
      cur.classList.toggle('is-view', !!view);
      if (view) label.textContent = view.dataset.cursor || 'عرض';
      cur.classList.toggle('is-hover', !view && !!t.closest('a, button, select, input, textarea, label'));
    });
  }
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, .4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, .4)' });
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * 0.3); yTo((e.clientY - r.top - r.height / 2) * 0.35); });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
}

/* ---------- 3D tilt on cards ---------- */
if (fine && !reduce) {
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(el, { rotateY: px * 6, rotateX: -py * 6, transformPerspective: 900, duration: 0.6, ease: 'power2.out' });
    });
    el.addEventListener('pointerleave', () => gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.9, ease: 'elastic.out(1, .5)' }));
  });
}

/* ---------- share buttons ---------- */
document.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((b) => b.addEventListener('click', async () => {
  const data = { title: document.title, url: location.href };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); b.dataset.done = '1'; b.querySelector('span')!.textContent = 'تم نسخ الرابط'; } } catch {}
}));

/* ---------- lead forms → WhatsApp (and Netlify Forms when hosted there) ---------- */
document.querySelectorAll<HTMLFormElement>('form[data-lead]').forEach((form) => form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const fd = new FormData(form);
  const lines = [form.dataset.lead || 'طلب عقاري جديد'];
  form.querySelectorAll<HTMLElement>('[name]').forEach((f) => {
    const n = f.getAttribute('name')!; if (n.startsWith('_') || n === 'form-name' || n === 'bot-field') return;
    const v = String(fd.get(n) || '').trim(); if (!v) return;
    const lbl = form.querySelector(`label[for="${f.id}"]`)?.textContent?.replace('*', '').trim() || n;
    lines.push(`${lbl}: ${v}`);
  });
  if (form.dataset.netlify !== undefined && location.hostname !== 'localhost') {
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fd as any).toString() }).catch(() => {});
  }
  const wa = form.dataset.wa!;
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  form.classList.add('is-sent');
}));

window.addEventListener('load', () => ScrollTrigger.refresh());
/* ---------- custom dropdowns: <select data-dd> becomes an accessible RTL listbox ---------- */
let ddSeq = 0;
const openDDs = new Set<() => void>();
export function enhanceSelect(sel: HTMLSelectElement) {
  if (sel.dataset.ddDone) return;
  sel.dataset.ddDone = '1';
  const id = `dd${++ddSeq}`;
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  sel.parentNode!.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  const label = sel.id ? document.querySelector<HTMLLabelElement>(`label[for="${sel.id}"]`) : null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = sel.classList.contains('input') ? 'dd__btn input' : 'dd__btn';
  if (sel.closest('.section--ivory, .section--ivory2') && !sel.closest('.lead-f')) wrap.classList.add('dd--light');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', id);
  const lblText = label?.textContent?.replace('*', '').trim() || sel.getAttribute('aria-label') || '';
  btn.innerHTML = `<span class="dd__val"></span><svg class="dd__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>`;
  if (label) { label.removeAttribute('for'); label.id ||= `${id}-l`; label.addEventListener('click', () => btn.focus()); }
  const list = document.createElement('ul');
  list.className = 'dd__list';
  list.id = id;
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  wrap.append(btn, list);

  let active = -1;
  const opts = () => Array.from(list.querySelectorAll<HTMLLIElement>('.dd__opt'));
  const render = () => {
    list.innerHTML = Array.from(sel.options).map((o, i) =>
      `<li class="dd__opt" role="option" id="${id}-${i}" data-v="${o.value.replace(/"/g, '&quot;')}" aria-selected="${o.selected}">${o.textContent}</li>`).join('');
    sync();
  };
  const sync = () => {
    const o = sel.options[sel.selectedIndex];
    btn.querySelector('.dd__val')!.textContent = o ? o.textContent : '';
    btn.setAttribute('aria-label', `${lblText}: ${o?.textContent ?? ''}`);
    btn.disabled = sel.disabled;
    opts().forEach((li, i) => li.setAttribute('aria-selected', String(i === sel.selectedIndex)));
  };
  const setActive = (i: number) => {
    const all = opts(); if (!all.length) return;
    active = (i + all.length) % all.length;
    all.forEach((li, k) => li.classList.toggle('is-active', k === active));
    list.setAttribute('aria-activedescendant', all[active].id);
    const li = all[active]; if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop - 6; else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight + 6;
  };
  const close = () => { wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); openDDs.delete(close); };
  const open = () => {
    openDDs.forEach((c) => c());
    const r = wrap.getBoundingClientRect();
    wrap.classList.toggle('is-up', window.innerHeight - r.bottom < 300 && r.top > 340);
    wrap.classList.remove('is-flip');
    wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); openDDs.add(close);
    const lr = list.getBoundingClientRect();
    if (lr.left < 8 || lr.right > window.innerWidth - 8) wrap.classList.add('is-flip');
    setActive(Math.max(0, sel.selectedIndex));
    list.focus({ preventScroll: true });
  };
  const choose = (i: number) => {
    if (i < 0) return;
    if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    sync(); close(); btn.focus();
  };
  btn.addEventListener('click', () => (wrap.classList.contains('is-open') ? close() : open()));
  btn.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } });
  list.addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest('.dd__opt'); if (li) choose(opts().indexOf(li as HTMLLIElement)); });
  list.addEventListener('pointermove', (e) => { const li = (e.target as HTMLElement).closest('.dd__opt'); if (li) setActive(opts().indexOf(li as HTMLLIElement)); });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(opts().length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape' || e.key === 'Tab') { close(); if (e.key === 'Escape') btn.focus(); }
    else if (e.key.length === 1) { const k = opts().findIndex((li) => li.textContent!.trim().startsWith(e.key)); if (k >= 0) setActive(k); }
  });
  list.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  list.setAttribute('data-lenis-prevent', '');
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target as Node)) close(); });
  sel.addEventListener('change', sync);
  // options are sometimes rebuilt (district list): re-render when they change
  new MutationObserver(render).observe(sel, { childList: true, attributes: true, attributeFilter: ['disabled'] });
  sel.form?.addEventListener('reset', () => setTimeout(sync));
  render();
}
document.querySelectorAll<HTMLSelectElement>('select.input, .sp__f select').forEach(enhanceSelect);

export { gsap, ScrollTrigger, reduce, fine };
