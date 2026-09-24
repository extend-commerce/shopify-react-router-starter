import {
  type SAppNavAttributes,
  type SAppWindowAttributes,
  type SPageAttributes,
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
  's-page': SPageAttributes;
}

declare module 'react' {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends AppBridgeElements {}
  }
}
