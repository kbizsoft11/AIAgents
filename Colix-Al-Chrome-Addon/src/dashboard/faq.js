(function () {
  const items = document.querySelectorAll('.faq-item');
  const categoryLinks = document.querySelectorAll('.faq-categories a');

  function setItemState(item, isOpen) {
    const button = item.querySelector('button');
    const answer = item.querySelector('.faq-answer');
    item.classList.toggle('is-open', isOpen);
    button.setAttribute('aria-expanded', String(isOpen));
    answer.hidden = !isOpen;
  }

  items.forEach(item => {
    const button = item.querySelector('button');
    button.addEventListener('click', () => {
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      setItemState(item, !isOpen);
    });
  });

  categoryLinks.forEach(link => {
    link.addEventListener('click', () => {
      categoryLinks.forEach(categoryLink => categoryLink.classList.remove('active'));
      link.classList.add('active');
    });
  });
}());
