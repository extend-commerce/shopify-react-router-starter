import { login } from 'app/shopify.server';
import { useState } from 'react';
import {
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { loginErrorMessage } from './error.server';

const POLARIS_SCRIPT_URL = 'https://cdn.shopify.com/shopifycloud/polaris.js';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState('');
  const { errors } = actionData || loaderData;

  return (
    <>
      <script src={POLARIS_SCRIPT_URL} />
      <s-page inlineSize="small">
        <s-section>
          <Form method="post">
            <s-stack direction="block" gap="base">
              <s-heading>Log in</s-heading>
              <s-text-field
                name="shop"
                label="Shop domain"
                details="example.myshopify.com"
                value={shop}
                onChange={event => setShop(event.currentTarget.value)}
                autocomplete="on"
                error={errors.shop}
              />
              <s-button type="submit">Log in</s-button>
            </s-stack>
          </Form>
        </s-section>
      </s-page>
    </>
  );
}
