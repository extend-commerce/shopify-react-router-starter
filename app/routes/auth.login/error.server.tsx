import {
  LoginErrorType,
  type LoginError,
} from '@shopify/shopify-app-react-router/server';

interface LoginErrorMessage {
  shop?: string;
}

export function loginErrorMessage(error?: LoginError): LoginErrorMessage {
  if (error?.shop === LoginErrorType.MissingShop) {
    return { shop: 'Please enter your shop domain to log in' };
  } else if (error?.shop === LoginErrorType.InvalidShop) {
    return { shop: 'Please enter a valid shop domain to log in' };
  }

  return {};
}
