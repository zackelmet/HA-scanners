import GetStartedButton from "../shared/GetStartedButton";

export default function TrustSection() {
  return (
    <section className="w-full py-16 lg:py-24 bg-base-100">
      <div className="max-w-5xl mx-auto px-8 text-center">
        <h2 className="text-4xl lg:text-5xl font-bold mb-6">
          Trusted by Security Professionals Worldwide
        </h2>
        <p className="text-2xl font-semibold text-primary mb-8">
          Maximize Security Efficiency. Minimize IT Headaches.
        </p>

        <div className="prose lg:prose-xl mx-auto mb-12">
          <p className="text-lg leading-relaxed">
            Hundreds of Systems Administrators, Network Engineers, Security
            Analysts, and IT Service Providers rely on HackerAnalytics.com daily
            to proactively monitor and detect critical vulnerabilities using our
            powerful suite of hosted scanners.
          </p>
          <p className="text-lg leading-relaxed mt-6">
            We are confident you&apos;ll find the value. Get started entirely
            risk-free today with our{" "}
            <strong>7-day, no-questions-asked refund policy</strong>.
          </p>
        </div>

        <GetStartedButton />
      </div>
    </section>
  );
}
