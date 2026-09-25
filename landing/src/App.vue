<script setup lang="ts">
import NavBar from './components/NavBar.vue';
import HeroSection from './components/HeroSection.vue';
import AppMockup from './components/AppMockup.vue';
import ChannelsBar from './components/ChannelsBar.vue';
import ProblemSection from './components/ProblemSection.vue';
import FeaturesSection from './components/FeaturesSection.vue';
import HowItWorks from './components/HowItWorks.vue';
import PricingSection from './components/PricingSection.vue';
import FaqSection from './components/FaqSection.vue';
import CtaSection from './components/CtaSection.vue';
import FooterSection from './components/FooterSection.vue';
import WhatsAppFloat from './components/WhatsAppFloat.vue';
</script>

<template>
  <NavBar />
  <main>
    <HeroSection />
    <AppMockup />
    <ChannelsBar />
    <ProblemSection />
    <FeaturesSection />
    <HowItWorks />
    <PricingSection />
    <FaqSection />
    <CtaSection />
  </main>
  <FooterSection />
  <WhatsAppFloat />
</template>
