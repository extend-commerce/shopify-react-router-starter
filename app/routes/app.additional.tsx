export default function AdditionalPage() {
  return (
    <s-page heading="Additional page">
      <s-section heading="Multiple pages">
        <s-paragraph>
          The app template comes with an additional page which demonstrates how to create multiple
          pages within app navigation using{' '}
          <s-link
            href="https://shopify.dev/docs/api/app-home/app-bridge-web-components/app-nav"
            target="_blank"
          >
            App Bridge
          </s-link>
          .
        </s-paragraph>
        <s-paragraph>
          To create your own page and have it show up in the app navigation, add a page inside{' '}
          <code>app/routes</code>, and a link to it in the <code>&lt;s-app-nav&gt;</code> component
          found in <code>app/routes/app.tsx</code>. Link between pages with{' '}
          <code>&lt;s-link&gt;</code>, like this link back to the{' '}
          <s-link href="/app">home page</s-link>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
