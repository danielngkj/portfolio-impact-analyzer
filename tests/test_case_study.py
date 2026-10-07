import tempfile
from pathlib import Path
import unittest

from scripts.render_case_study import ROOT, SOURCE, render_case_study


class CaseStudyTests(unittest.TestCase):
    def test_source_edits_update_the_generated_page(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as directory:
            source = Path(directory) / "case-study.md"
            source.write_text("# Updated case study\n\nOne **source** drives both outputs.\n\n## New section\n\nNew content.\n")
            page = render_case_study(source=source)
            self.assertIn('<h1 id="updated-case-study">Updated case study</h1>', page)
            self.assertIn("One <strong>source</strong> drives both outputs.", page)
            self.assertIn('<h2 id="new-section">New section</h2>', page)
            self.assertNotIn("{{CONTENT}}", page)

    def test_source_formatting_and_public_links(self):
        page = render_case_study()
        self.assertIn('<figure><img alt="Review paths:', page)
        self.assertIn('src="review-paths.svg"', page)
        self.assertIn('<div class="case-table"><table>', page)
        self.assertIn('<th scope="col">Review group</th>', page)
        self.assertIn('<blockquote>', page)
        self.assertIn('id="scope-and-limitations"', page)
        self.assertIn('https://github.com/danielngkj/portfolio-impact-analyzer/blob/main/docs/development.md#verification-checklist', page)
        self.assertIn('https://github.com/danielngkj/portfolio-impact-analyzer/blob/main/README.md', page)
        self.assertNotIn('href="development.md', page)

    def test_generated_page_preserves_shared_header_and_footer(self):
        page = render_case_study()
        home = (ROOT / "web/index.html").read_text()
        for opening, closing in [("<header>", "</header>"), ("<footer>", "</footer>")]:
            shared = home[home.index(opening):home.index(closing) + len(closing)]
            self.assertIn(shared, page)
        self.assertIn('<base href="../">', page)


if __name__ == "__main__":
    unittest.main()
