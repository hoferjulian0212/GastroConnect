import { useCallback, useEffect, useRef } from "react";

function getCartTarget(): Element | null {
  const isMobile = window.innerWidth < 768;
  const selector = isMobile
    ? '[data-testid="restaurant-mobile-nav-cart"]'
    : '[data-testid="button-cart-header"]';
  return document.querySelector(selector);
}

function triggerBounce(el: Element) {
  el.classList.remove("cart-target-bounce");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("cart-target-bounce");
}

export function useFlyToCart() {
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  const addTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  };

  const triggerFly = useCallback(
    (sourceEl: HTMLElement, imageUrl?: string | null) => {
      const cartTarget = getCartTarget();
      if (!cartTarget) return;

      const targetRect = cartTarget.getBoundingClientRect();
      const sourceRect = sourceEl.getBoundingClientRect();

      const flyer = document.createElement("div");
      flyer.className = "fly-to-cart-element";

      if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.style.cssText =
          "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
        flyer.appendChild(img);
      } else {
        flyer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:white"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`;
        flyer.style.display = "flex";
        flyer.style.alignItems = "center";
        flyer.style.justifyContent = "center";
        flyer.style.background = "rgb(34, 197, 94)";
      }

      const size = 48;
      flyer.style.position = "fixed";
      flyer.style.zIndex = "9999";
      flyer.style.width = `${size}px`;
      flyer.style.height = `${size}px`;
      flyer.style.borderRadius = "12px";
      flyer.style.overflow = "hidden";
      flyer.style.pointerEvents = "none";
      flyer.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)";

      const startX = sourceRect.left + sourceRect.width / 2 - size / 2;
      const startY = sourceRect.top + sourceRect.height / 2 - size / 2;
      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;

      const endX = targetRect.left + targetRect.width / 2 - size / 2;
      const endY = targetRect.top + targetRect.height / 2 - size / 2;
      const dx = endX - startX;
      const dy = endY - startY;

      flyer.style.setProperty("--fly-dx", `${dx}px`);
      flyer.style.setProperty("--fly-dy", `${dy}px`);

      document.body.appendChild(flyer);

      requestAnimationFrame(() => {
        flyer.classList.add("fly-to-cart-animate");
      });

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (flyer.parentNode) flyer.remove();
        const target = getCartTarget();
        if (target) triggerBounce(target);
      };

      flyer.addEventListener("animationend", cleanup, { once: true });
      addTimer(() => {
        if (!cleaned) cleanup();
      }, 1200);
    },
    []
  );

  return { triggerFly };
}
