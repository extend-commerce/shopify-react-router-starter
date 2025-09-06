import { redirect, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import { login } from 'app/shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get('shop')) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-primary-50 to-primary-100 p-4">
      <div className="w-full max-w-2xl bg-white/80 rounded-3xl shadow-xl px-8 py-12 flex flex-col items-center gap-10 border border-primary-100">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl md:text-4xl font-extrabold text-primary-900 tracking-tight mb-2">
            Shopify Remix Starter
          </h1>
          <p className="text-lg md:text-xl text-primary-700 font-medium">
            A tagline about [your app] that describes your value proposition.
          </p>
        </div>
        {showForm && (
          <Form
            className="w-full max-w-md flex flex-col items-center gap-6 bg-primary-50/60 rounded-xl shadow p-6 border border-primary-200"
            method="post"
            action="/auth/login"
          >
            <label className="w-full flex flex-col gap-2 text-left text-base font-medium text-primary-900">
              <span>Shop domain</span>
              <input
                className="p-2 border border-primary-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                type="text"
                name="shop"
                placeholder="my-shop-domain.myshopify.com"
                autoComplete="off"
              />
              <span className="text-xs text-primary-500">
                e.g: my-shop-domain.myshopify.com
              </span>
            </label>
            <button
              className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-md shadow transition"
              type="submit"
            >
              Log in
            </button>
          </Form>
        )}
        <ul className="w-full flex flex-col md:flex-row gap-4 pt-8">
          <li className="flex-1 bg-white/70 rounded-lg shadow p-6 text-left border border-primary-100">
            <strong className="text-primary-800">Product feature</strong>. Some
            detail about your feature and its benefit to your customer.
          </li>
          <li className="flex-1 bg-white/70 rounded-lg shadow p-6 text-left border border-primary-100">
            <strong className="text-primary-800">Product feature</strong>. Some
            detail about your feature and its benefit to your customer.
          </li>
          <li className="flex-1 bg-white/70 rounded-lg shadow p-6 text-left border border-primary-100">
            <strong className="text-primary-800">Product feature</strong>. Some
            detail about your feature and its benefit to your customer.
          </li>
        </ul>
      </div>
    </div>
  );
}
