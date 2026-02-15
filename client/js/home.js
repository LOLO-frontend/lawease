(function () {
  const revealNodes = document.querySelectorAll(".scroll-reveal");
  if (!revealNodes.length) return;

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  revealNodes.forEach(function (node, index) {
    node.style.transitionDelay = `${index * 80}ms`;
    observer.observe(node);
  });
})();
