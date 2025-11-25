import HeroSection from "@/components/sections/HeroSection";
import FeaturesSection from "@/components/sections/FeaturesSection";
import TrustSection from "@/components/sections/TrustSection";
import KeyFeaturesSection from "@/components/sections/KeyFeaturesSection";
import SubscriptionCardContainer from "@/components/subscription/SubscriptionCardContainer";
import fetchStripeProducts from "@/lib/stripe/fetchStripeProducts";

export default async function Home() {
  const { products } = await fetchStripeProducts();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <HeroSection />

      <FeaturesSection />

      <TrustSection />

      <KeyFeaturesSection />

      {products.length > 0 ? (
        <div className="w-full py-16 lg:py-24 bg-base-100">
          <div className="max-w-7xl mx-auto px-8">
            <div className="text-center mb-12">
              <h2 className="text-4xl lg:text-5xl font-bold mb-4">
                Choose Your Plan
              </h2>
              <p className="text-xl opacity-80">
                Start protecting your infrastructure today
              </p>
            </div>
            <SubscriptionCardContainer
              products={products}
              salesCall="Secure your network with our powerful hosted scanning tools. 7-day money-back guarantee!"
            />
          </div>
        </div>
      ) : (
        <p>No subscription plans available at the moment.</p>
      )}
    </main>
  );
}
