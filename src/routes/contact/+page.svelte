<script lang="ts">
  let { children } = $props();
</script>

<svelte:head>
  <title>Contact | Germinal</title>
</svelte:head>

<div class="container mx-auto px-4 py-12 max-w-2xl">
  <h1 class="text-4xl font-bold mb-8">Contact Us</h1>

  <p class="text-lg text-gray-700 mb-8">
    Get in touch with us for inquiries about events, talents, or any other questions.
  </p>

  <form class="space-y-6">
    <div>
      <label for="name" class="block text-sm font-medium text-gray-700 mb-2">Name</label>
      <input
        type="text"
        id="name"
        name="name"
        required
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>

    <div>
      <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Email</label>
      <input
        type="email"
        id="email"
        name="email"
        required
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>

    <div>
      <label for="subject" class="block text-sm font-medium text-gray-700 mb-2">Subject</label>
      <input
        type="text"
        id="subject"
        name="subject"
        required
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>

    <div>
      <label for="message" class="block text-sm font-medium text-gray-700 mb-2">Message</label>
      <textarea
        id="message"
        name="message"
        rows="5"
        required
        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      ></textarea>
    </div>

    <button
      type="submit"
      class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
    >
      Send Message
    </button>
  </form>
</div>
