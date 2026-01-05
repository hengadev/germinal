<script lang="ts">
  import Navigation from '$lib/components/Navigation.svelte';
  import './layout.css';

  let { children } = $props();
</script>

<div class="min-h-screen flex flex-col">
  <Navigation />

  <main class="flex-1">
    {@render children()}
  </main>

  <footer class="bg-gray-900 text-white py-8 mt-12">
    <div class="container mx-auto px-4 text-center">
      <p>&copy; {new Date().getFullYear()} Germinal. All rights reserved.</p>
    </div>
  </footer>
</div>
