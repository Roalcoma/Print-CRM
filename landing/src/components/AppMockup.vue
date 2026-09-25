<script setup lang="ts">
import { defineComponent, h } from 'vue';

const WaIcon = () => h('svg', { class: 'w-4 h-4 text-green-400', fill: 'currentColor', viewBox: '0 0 24 24' }, [
  h('path', { d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' }),
]);

const IgIcon = () => h('svg', { class: 'w-4 h-4 text-pink-400', fill: 'currentColor', viewBox: '0 0 24 24' }, [
  h('path', { d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' }),
]);

const MockConversation = defineComponent({
  props: {
    channel: String as () => 'wa' | 'ig' | 'fb',
    active:  Boolean,
    unread:  Number,
  },
  setup(props) {
    return () => {
      const bgColor = props.channel === 'wa' ? 'bg-green-500/20' : props.channel === 'ig' ? 'bg-pink-500/20' : 'bg-blue-500/20';
      const Icon    = props.channel === 'wa' ? WaIcon : IgIcon;
      return h('div', {
        class: `flex items-center gap-3 p-2 rounded-lg ${props.active ? 'bg-primary/10 border border-primary/20' : ''}`,
      }, [
        h('div', { class: `w-8 h-8 rounded-full ${bgColor} flex items-center justify-center shrink-0` }, [h(Icon)]),
        h('div', { class: 'flex-1 min-w-0' }, [
          h('div', { class: 'flex justify-between mb-1' }, [
            h('div', { class: `h-2.5 rounded-full ${props.active ? 'w-20 bg-primary/60' : 'w-20 bg-gray-500'}` }),
            h('div', { class: 'h-2 w-8 bg-gray-600 rounded-full' }),
          ]),
          h('div', { class: 'h-2 w-36 bg-gray-700 rounded-full' }),
        ]),
        props.unread
          ? h('div', { class: 'w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0' }, [
              h('span', { class: 'text-[9px] text-white font-bold' }, String(props.unread)),
            ])
          : null,
      ]);
    };
  },
});

const mockConvs: Array<{ channel: 'wa' | 'ig' | 'fb'; active: boolean; unread: number }> = [
  { channel: 'wa', active: false, unread: 3 },
  { channel: 'ig', active: false, unread: 0 },
  { channel: 'fb', active: false, unread: 0 },
  { channel: 'wa', active: true,  unread: 0 },
];
</script>

<template>
  <div class="relative z-20 -mt-72 mb-16 flex justify-center px-4">
    <div class="w-full max-w-5xl float">
      <div class="bg-gray-900 rounded-2xl border border-white/10 overflow-hidden" style="box-shadow:0 30px 80px rgba(0,0,0,0.35)">
        <div class="flex items-center gap-2 px-4 py-3 bg-gray-800/80 border-b border-white/10">
          <div class="w-3 h-3 rounded-full bg-red-500" />
          <div class="w-3 h-3 rounded-full bg-yellow-500" />
          <div class="w-3 h-3 rounded-full bg-green-500" />
          <div class="flex-1 text-center">
            <span class="text-xs text-gray-500 font-mono">rocco.arbolaureo.org</span>
          </div>
        </div>
        <div class="flex h-48 md:h-64">
          <div class="w-14 md:w-48 bg-gray-900 border-r border-white/10 flex flex-col gap-1 p-2 md:p-3 shrink-0">
            <div class="h-8 bg-primary/30 rounded-lg mb-2" />
            <div class="hidden md:flex items-center gap-2 px-2 py-1.5 bg-primary/20 rounded-lg">
              <div class="w-3 h-3 bg-primary rounded-full shrink-0" />
              <div class="h-2.5 bg-primary/60 rounded-full flex-1" />
            </div>
            <div v-for="i in 3" :key="i" class="hidden md:flex items-center gap-2 px-2 py-1.5 rounded-lg">
              <div class="w-3 h-3 bg-gray-600 rounded-full shrink-0" />
              <div class="h-2 bg-gray-700 rounded-full flex-1" />
            </div>
            <div class="flex-1" />
            <div class="h-6 w-6 md:h-8 md:w-full bg-gray-700 rounded-full md:rounded-lg" />
          </div>
          <div class="flex-1 bg-gray-950 p-3 md:p-4 overflow-hidden">
            <div class="flex items-center justify-between mb-3">
              <div class="h-5 w-32 bg-gray-700 rounded-lg" />
              <div class="flex gap-2">
                <div class="h-6 w-6 bg-gray-700 rounded-full" />
                <div class="h-6 w-6 bg-gray-700 rounded-full" />
              </div>
            </div>
            <div class="space-y-2">
              <MockConversation v-for="(item, idx) in mockConvs" :key="idx" v-bind="item" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
