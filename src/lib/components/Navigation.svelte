<script lang="ts">
  import { page } from '$app/stores';

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/events', label: 'Events' },
    { href: '/talents', label: 'Talents' },
    { href: '/contact', label: 'Contact' },
  ];

  function isActive(href: string): boolean {
    if (href === '/') {
      return $page.url.pathname === '/';
    }
    return $page.url.pathname.startsWith(href);
  }
</script>

<nav class="bg-white shadow-md">
  <div class="container mx-auto px-4">
    <div class="flex items-center justify-between h-16">
      <a href="/" class="text-2xl font-bold text-gray-900">
        Germinal
      </a>

      <ul class="flex gap-8">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class="text-gray-700 hover:text-gray-900 font-medium transition-colors"
              class:text-blue-600={isActive(item.href)}
              class:font-bold={isActive(item.href)}
            >
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</nav>
