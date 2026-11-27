import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  keepPopoverHostOnTop,
  TOP_LAYER_ATTRIBUTE,
  TOP_LAYER_STYLE_ATTRIBUTE,
} from './top-layer-host';

describe('keepPopoverHostOnTop', () => {
  let host: HTMLElement;
  let originalShowPopover: (() => void) | undefined;

  beforeEach(() => {
    const proto = HTMLElement.prototype as { showPopover?: () => void };
    originalShowPopover = proto.showPopover;
    proto.showPopover = vi.fn();
    host = document.createElement('div');
    host.dataset.findinpageHost = 'true';
    document.documentElement.append(host);
  });

  afterEach(() => {
    host.remove();
    document.querySelectorAll(`[${TOP_LAYER_ATTRIBUTE}]`).forEach((node) => node.remove());
    document.querySelectorAll(`[${TOP_LAYER_STYLE_ATTRIBUTE}]`).forEach((node) => node.remove());
    const proto = HTMLElement.prototype as { showPopover?: () => void };
    if (originalShowPopover === undefined) {
      Reflect.deleteProperty(proto, 'showPopover');
    } else {
      proto.showPopover = originalShowPopover;
    }
    vi.restoreAllMocks();
  });

  it('does not open a top-layer popover on initial mount while the panel is closed', () => {
    const onPromote = vi.fn();
    const controller = keepPopoverHostOnTop(host, onPromote);

    expect(document.querySelector(`[${TOP_LAYER_ATTRIBUTE}]`)).toBeNull();
    expect(document.querySelector(`[${TOP_LAYER_STYLE_ATTRIBUTE}]`)).toBeNull();
    expect(onPromote).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('installs backdrop isolation styles and promotes the host when active', () => {
    const onPromote = vi.fn();
    const onDemote = vi.fn();
    const controller = keepPopoverHostOnTop(host, onPromote, onDemote);

    controller.promote('panel-opened');

    const layer = document.querySelector<HTMLElement>(`[${TOP_LAYER_ATTRIBUTE}="true"]`);
    const style = document.querySelector<HTMLStyleElement>(`[${TOP_LAYER_STYLE_ATTRIBUTE}="true"]`);
    expect(layer).not.toBeNull();
    expect(layer?.getAttribute('popover')).toBe('manual');
    expect(layer?.contains(host)).toBe(true);
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain(`div[${TOP_LAYER_ATTRIBUTE}="true"][popover]::backdrop`);
    expect(style?.textContent).toContain('display: none !important');
    expect(style?.textContent).toContain('background: transparent !important');
    expect(onPromote).toHaveBeenCalledWith('panel-opened');

    controller.demote('panel-closed');
    expect(document.querySelector(`[${TOP_LAYER_ATTRIBUTE}]`)).toBeNull();
    expect(host.parentElement).toBe(document.documentElement);
    expect(onDemote).toHaveBeenCalledWith('panel-closed');

    controller.destroy();
    expect(document.querySelector(`[${TOP_LAYER_STYLE_ATTRIBUTE}]`)).toBeNull();
  });

  it('re-promotes on page popover open only while active', async () => {
    const onPromote = vi.fn();
    const controller = keepPopoverHostOnTop(host, onPromote);
    const pagePopover = document.createElement('div');
    pagePopover.setAttribute('popover', 'auto');
    document.body.append(pagePopover);

    const dispatchOpenToggle = () => {
      const event = new Event('toggle');
      Object.defineProperty(event, 'newState', { value: 'open' });
      pagePopover.dispatchEvent(event);
    };

    // Inactive: should not promote.
    dispatchOpenToggle();
    await Promise.resolve();
    expect(onPromote).not.toHaveBeenCalled();

    // Active: should re-promote after a page popover opens.
    controller.promote('panel-opened');
    onPromote.mockClear();
    dispatchOpenToggle();
    await Promise.resolve();
    expect(onPromote).toHaveBeenCalledWith('page-popover-opened');

    // Demoted again: should no longer promote.
    controller.demote('panel-closed');
    onPromote.mockClear();
    dispatchOpenToggle();
    await Promise.resolve();
    expect(onPromote).not.toHaveBeenCalled();

    pagePopover.remove();
    controller.destroy();
  });
});
