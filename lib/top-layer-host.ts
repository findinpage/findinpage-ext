export type TopLayerHostController = {
  promote(trigger: string): void;
  destroy(): void;
};

const TOP_LAYER_ATTRIBUTE = 'data-findinpage-top-layer';

export function keepPopoverHostOnTop(
  host: HTMLElement,
  onPromote?: (trigger: string) => void,
): TopLayerHostController {
  const ownerDocument = host.ownerDocument;
  let layer: HTMLElement | undefined;
  let promoteAfterToggle = false;

  const promote = (trigger: string) => {
    if (!host.isConnected || typeof host.showPopover !== 'function') return;

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

  const onPopoverToggle = (event: Event) => {
    const target = event.target;
    if (
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
      promote('page-popover-opened');
    });
  };

  if (typeof host.showPopover === 'function') {
    ownerDocument.addEventListener('toggle', onPopoverToggle, { capture: true });
    promote('ui-mount');
  }

  return {
    promote,
    destroy() {
      ownerDocument.removeEventListener('toggle', onPopoverToggle, { capture: true });
      if (layer?.contains(host)) ownerDocument.documentElement.append(host);
      layer?.remove();
      layer = undefined;
    },
  };
}
