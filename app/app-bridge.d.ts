// @shopify/app-bridge-types adds its elements to the global JSX namespace, which React 19's types
// no longer read, so re-declare them on React's. The s-* Polaris elements (s-page, s-link, ...)
// are already typed on React's namespace by @shopify/polaris-types.
import {
  type SAppNavAttributes,
  type SAppWindowAttributes,
  type UIModalAttributes,
  type UINavMenuAttributes,
  type UISaveBarAttributes,
  type UITitleBarAttributes,
} from '@shopify/app-bridge-types';

interface AppBridgeElements {
  'ui-modal': UIModalAttributes;
  's-app-window': SAppWindowAttributes;
  'ui-nav-menu': UINavMenuAttributes;
  's-app-nav': SAppNavAttributes;
  'ui-save-bar': UISaveBarAttributes;
  'ui-title-bar': UITitleBarAttributes;
}

declare module 'react' {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends AppBridgeElements {}
  }
}
