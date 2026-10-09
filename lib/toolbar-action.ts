export function resolveToolbarAction<T>(
  action: T | undefined,
  browserAction: T | undefined,
): T {
  const toolbarAction = action ?? browserAction;
  if (!toolbarAction) {
    throw new Error('Find in Page could not initialize: no toolbar action API is available.');
  }
  return toolbarAction;
}
