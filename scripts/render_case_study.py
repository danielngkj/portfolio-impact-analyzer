"""Generate the case-study webpage from its Markdown source and page template."""

import argparse
from pathlib import Path
from urllib.parse import quote, urlsplit
import xml.etree.ElementTree as ET

import markdown

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/portfolio-case-study.md"
TEMPLATE = ROOT / "web/case-study.template.html"
REPOSITORY = "https://github.com/danielngkj/portfolio-impact-analyzer/blob/main/"


def render_case_study(source=SOURCE, template=TEMPLATE):
    """Render trusted project Markdown; preserve layout and resolve source-relative links."""
    content = markdown.markdown(source.read_text(), extensions=["tables", "fenced_code", "toc"], output_format="xhtml")
    article = ET.fromstring(f"<article>{content}</article>")
    for link in article.iter("a"):
        target = urlsplit(link.get("href", ""))
        if not target.scheme and not target.netloc and target.path:
            document = (source.parent / target.path).resolve()
            if document.suffix == ".md":
                if not document.is_file():
                    raise ValueError(f"Missing case-study link: {target.path}")
                relative = document.relative_to(ROOT).as_posix()
                link.set("href", REPOSITORY + quote(relative) + (f"#{target.fragment}" if target.fragment else ""))
    for image in article.iter("img"):
        path = (source.parent / image.get("src", "")).resolve()
        # This diagram is the only image currently used by the case study.
        if path != ROOT / "docs/assets/review-paths.svg" or not path.is_file():
            raise ValueError(f"Unknown case-study image: {image.get('src')}")
        image.set("src", "review-paths.svg")
    first_paragraph = article.find("p")
    if first_paragraph is not None:
        first_paragraph.set("class", "case-lead")
    for parent in list(article.iter()):
        for index, child in enumerate(list(parent)):
            if child.tag == "p" and len(child) == 1 and child[0].tag == "img":
                child.tag = "figure"
            elif child.tag == "table":
                wrapper = ET.Element("div", {"class": "case-table"})
                parent.remove(child)
                wrapper.append(child)
                parent.insert(index, wrapper)
    for heading in article.findall(".//th"):
        heading.set("scope", "col")
    body = "\n".join(ET.tostring(child, encoding="unicode", method="html") for child in article)
    page = template.read_text()
    if page.count("{{CONTENT}}") != 1:
        raise ValueError("The case-study template must contain one content placeholder")
    return page.replace("{{CONTENT}}", body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_case_study())


if __name__ == "__main__":
    main()
