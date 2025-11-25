import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShieldHalved,
  faServer,
  faNetworkWired,
  faBolt,
  faArrowsRotate,
  faClock,
} from "@fortawesome/free-solid-svg-icons";

export default function FeaturesSection() {
  const features = [
    {
      icon: faShieldHalved,
      title: "Internet Facing Vulnerability Scanners",
      subtitle: "Attacker's Perspective Testing",
      description:
        "Proactively hunt for security weaknesses by simulating real-world security events and assessing vulnerabilities from the attacker's viewpoint.",
      badge: "Network security perspective",
    },
    {
      icon: faServer,
      title: "Security Professional Standard",
      subtitle: "Trusted Industry Tools",
      description:
        "Find security holes using trusted open-source tools—the same powerful scanners utilized by penetration testers and security professionals around the world.",
      badge: "Trusted security tools",
    },
    {
      icon: faNetworkWired,
      title: "Full Network Visibility",
      subtitle: "Complete Attack Surface Discovery",
      description:
        "Discover and map your entire attack surface using a combination of scanning tools and open-source intelligence to gain improved visibility into your network footprint.",
      badge: "Network discovery",
    },
    {
      icon: faBolt,
      title: "Fast & Hassle-Free",
      subtitle: "Zero Maintenance & Optimized Performance",
      description:
        "Leverage fast servers optimized for vulnerability scanning across the Internet, requiring zero software installation, setup, or maintenance on your end.",
      badge: "High performance servers",
    },
    {
      icon: faArrowsRotate,
      title: "Continuous Security Improvement",
      subtitle: "Identify, Remediate, Re-Test Cycle",
      description:
        "Fixing security issues is a process: quickly identify the issue, remediate the risk using actionable data, and test again to be completely sure.",
      badge: "Security workflow cycle",
    },
    {
      icon: faClock,
      title: "Since 1997",
      subtitle: "Proven Technology & Deep Experience",
      description:
        "Your security relies on decades of refinement. The underlying open-source technology, such as Nmap, has been actively developed and trusted by the security community since the late 1990s.",
      badge: "Proven technology",
    },
  ];

  return (
    <section id="features" className="w-full bg-base-200 py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Complete Security Assessment Platform
          </h2>
          <p className="text-xl opacity-80">
            Proactive vulnerability detection with industry-leading tools
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow"
            >
              <div className="card-body">
                <div className="flex items-start gap-4">
                  <div className="text-primary text-3xl mt-1">
                    <FontAwesomeIcon icon={feature.icon} />
                  </div>
                  <div className="flex-1">
                    <div className="badge badge-ghost badge-sm mb-2">
                      {feature.badge}
                    </div>
                    <h3 className="card-title text-lg mb-2">
                      {feature.title}
                    </h3>
                    <p className="font-semibold text-primary mb-2">
                      {feature.subtitle}
                    </p>
                    <p className="text-sm opacity-80">{feature.description}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
