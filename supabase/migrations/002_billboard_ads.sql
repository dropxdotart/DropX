-- In-world billboards beside the demolition lot, managed like any other ad
-- creative from /admin/ads.
alter type ad_placement add value if not exists 'billboard';
