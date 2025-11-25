import GetStartedButton from "../shared/GetStartedButton";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-8 px-8 py-16 lg:py-24">
      <div className="flex flex-col gap-6 items-center justify-center text-center max-w-4xl">
        <h1 className="font-extrabold text-5xl lg:text-7xl tracking-tight flex flex-col gap-2 items-center">
          <span className="text-base-content">Hosted Security Scanners</span>
        </h1>
        
        <h2 className="text-2xl lg:text-3xl font-bold text-primary">
          Vulnerability Scanning: Zero Install. Maximum Impact.
        </h2>

        <p className="text-lg lg:text-xl opacity-80 leading-relaxed max-w-3xl">
          Simplify your security workflow. Our hosted Nmap and OpenVAS services run on fast, 
          optimized servers with no installation or maintenance required.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <GetStartedButton />
          <Link href="#features" className="btn btn-outline btn-lg">
            View Use Cases
          </Link>
        </div>
      </div>
    </section>
  );
}
