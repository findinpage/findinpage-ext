export type TopLayerHostController = {
  promote(trigger: string): void;
  demote(trigger: string): void;
  destroy(): void;
};

export const TOP_LAYER_ATTRIBUTE = 'data-findinpage-top-layer';
export const TOP_LAYER_STYLE_ATTRIBUTE = 'data-findinpage-top-layer-style';

const TOP_LAYER_BACKDROP_CSS = `div[${TOP_LAYER_ATTRIBUTE}="true"][popover]::backdrop {
  display: none !important;
  background: transparent !important;
  opacity: 0 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  pointer-events: none !important;
}`;

export function keepPopoverHostOnTop(
  host: HTMLElement,
  onPromote?: (trigger: string) => void,
  onDemote?: (trigger: string) => void,
): TopLayerHostController {
  const ownerDocument = host.ownerDocument;
  let layer: HTMLElement | undefined;
  let backdropStyle: HTMLStyleElement | undefined;
  let active = false;
  let promoteAfterToggle = false;

  const ensureBackdropStyle = () => {
    if (backdropStyle?.isConnected) return;
    const style = ownerDocument.createElement('style');
    style.setAttribute(TOP_LAYER_STYLE_ATTRIBUTE, 'true');
    style.textContent = TOP_LAYER_BACKDROP_CSS;
    (ownerDocument.head ?? ownerDocument.documentElement).append(style);
    backdropStyle = style;
  };

  const promote = (trigger: string) => {
    active = true;
    if (!host.isConnected || typeof host.showPopover !== 'function') return;

    ensureBackdropStyle();

    const nextLayer = ownerDocument.createElement('div');
    nextLayer.setAttribute(TOP_LAYER_ATTRIBUTE, 'true');
    nextLayer.setAttribute('popover', 'manual');
    nextLayer.style.cssText = [
      'position:fixed',
      'inset:0',
      'width:100vw',
      'height:100vh',
      'max-width:none',
      'max-height:none',
      'margin:0',
      'padding:0',
      'border:0',
      'background:transparent',
      'pointer-events:none',
    ].join(';');

    try {
      ownerDocument.documentElement.append(nextLayer);
      nextLayer.append(host);
      nextLayer.showPopover();
      layer?.remove();
      layer = nextLayer;
      onPromote?.(trigger);
    } catch {
      nextLayer.remove();
      if (!host.isConnected) ownerDocument.documentElement.append(host);
    }
  };

  const demote = (trigger: string) => {
    active = false;
    if (!layer) return;
    if (layer.contains(host)) ownerDocument.documentElement.append(host);
    layer.remove();
    layer = undefined;
    onDemote?.(trigger);
  };

  const onPopoverToggle = (event: Event) => {
    const target = event.target;
    if (
      !active ||
      !(target instanceof HTMLElement) ||
      target.hasAttribute(TOP_LAYER_ATTRIBUTE) ||
      !target.hasAttribute('popover') ||
      (event as ToggleEvent).newState !== 'open' ||
      promoteAfterToggle
    ) {
      return;
    }

    promoteAfterToggle = true;
    queueMicrotask(() => {
      promoteAfterToggle = false;
      if (active) promote('page-popover-opened');
    });
  };

  if (typeof host.showPopover === 'function') {
    ownerDocument.addEventListener('toggle', onPopoverToggle, { capture: true });
  }

  return {
    promote,
    demote,
    destroy() {
      active = false;
      ownerDocument.removeEventListener('toggle', onPopoverToggle, { capture: true });
      if (layer?.contains(host)) ownerDocument.documentElement.append(host);
      layer?.remove();
      layer = undefined;
      backdropStyle?.remove();
      backdropStyle = undefined;
    },
  };
}
