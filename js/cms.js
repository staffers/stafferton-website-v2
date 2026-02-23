// CMS Data Store - Edit this file to manage your content
// Or use /admin to manage via the browser UI (saves to localStorage)

const CMS = {
  posts: [
    {
      id: 1,
      slug: "ai-automation-seo",
      category: "SEO",
      title: "How AI Automation is Transforming SEO in 2025",
      excerpt: "Discover how forward-thinking agencies are using AI to automate keyword research, content optimisation, and technical audits at scale.",
      date: "12 Feb 2025",
      readTime: "5 min read",
      icon: "🤖",
      content: `<p>Artificial intelligence has moved from novelty to necessity in the world of search engine optimisation. Agencies that embraced AI tooling early are now running comprehensive audits in hours rather than days, and producing content strategies that would have taken a full team weeks to develop.</p>
      <p>The key shift isn't just speed — it's the ability to identify patterns across thousands of data points simultaneously. Modern AI tools can spot topical gaps, analyse competitor content clusters, and surface quick-win opportunities that a manual process would miss entirely.</p>
      <h2>What's Actually Changing</h2>
      <p>Three areas are seeing the most disruption: technical auditing, keyword clustering, and content briefing. AI tools now handle the grunt work in all three, freeing up strategists to focus on interpretation and client communication — the genuinely high-value work.</p>`
    },
    {
      id: 2,
      slug: "content-strategy-boutique-agencies",
      category: "Strategy",
      title: "Content Strategy for Boutique Digital Agencies",
      excerpt: "Smaller agencies have a unique advantage in content marketing — authenticity. Here's how to turn that into a repeatable growth engine.",
      date: "5 Feb 2025",
      readTime: "7 min read",
      icon: "📝",
      content: `<p>Boutique agencies often feel outgunned when it comes to content — they can't produce the volume of large competitors. But volume was always the wrong game to play. The agencies winning on organic search in 2025 are winning on depth, specificity, and genuine expertise.</p>
      <p>Your client case studies are your most powerful content asset. Each project contains a story that larger agencies can't replicate: the specific challenge, the bespoke solution, the measurable outcome. That specificity is what ranks, and more importantly, what converts.</p>`
    },
    {
      id: 3,
      slug: "local-seo-guide-2025",
      category: "Local SEO",
      title: "The Complete Local SEO Guide for UK Businesses",
      excerpt: "Google's local search landscape has evolved significantly. This guide covers everything UK businesses need to know to dominate their local market.",
      date: "28 Jan 2025",
      readTime: "9 min read",
      icon: "📍",
      content: `<p>Local SEO in the UK has its own distinct quirks — from the prominence of Google Business Profile to the role of local citations and the way Brits search differently to their American counterparts. This guide cuts through the noise.</p>
      <p>The single biggest leverage point for most local businesses remains Google Business Profile. A fully optimised, actively managed GBP listing consistently outperforms expensive paid campaigns for local intent queries. And yet most profiles remain half-filled and untouched after initial setup.</p>`
    }
  ],

  caseStudies: [
    {
      id: 1,
      name: "Max's SaaS Scale-Up",
      company: "CloudFlow",
      role: "Founder",
      description: "Implemented a full SEO content programme alongside technical optimisation. Organic traffic became the primary acquisition channel within six months.",
      stat1_num: "50%",
      stat1_label: "Reduction in CAC",
      stat2_num: "75%",
      stat2_label: "Growth in organic traffic",
      icon: "☁️"
    },
    {
      id: 2,
      name: "Emily's E-commerce Turnaround",
      company: "BloomTech",
      role: "CEO",
      description: "Rebuilt site architecture and implemented a structured content strategy targeting high-intent commercial queries. Results followed within 90 days.",
      stat1_num: "60%",
      stat1_label: "Increase in organic revenue",
      stat2_num: "45%",
      stat2_label: "Improvement in conversion",
      icon: "🌸"
    },
    {
      id: 3,
      name: "Sophia's Retail Breakthrough",
      company: "Trendify",
      role: "Marketing Lead",
      description: "AI-assisted competitor gap analysis revealed untapped category pages. A focused three-month build-out delivered significant ranking improvements.",
      stat1_num: "40%",
      stat1_label: "Lift in repeat purchases",
      stat2_num: "30%",
      stat2_label: "Growth in retention",
      icon: "🛍️"
    }
  ]
};

// Merge with localStorage overrides (from admin panel)
(function() {
  try {
    const stored = localStorage.getItem('cms_data');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.posts) CMS.posts = data.posts;
      if (data.caseStudies) CMS.caseStudies = data.caseStudies;
    }
  } catch(e) {}
})();
