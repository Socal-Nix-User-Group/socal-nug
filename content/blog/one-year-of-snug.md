+++
template = "blog_templates/oneyearsnug.html"
title = "One Year of SNUG"
description = "Looking back and the Nix Users Group that could"
date = "2024-05-31"
+++

<figure class="snug-oneyear-banner">
<img src="/blog/one-year-snug/banner.png">

<h2 class="title font-preston-one">Looking back on the little NUG that could</h2>
</figure>

<div class="snug-one-year-intro content">
<p>
    We started the Southern California Nix Users Group (SNUG) in 2023.
</p>
<p>
    It's been a year since then and we've come a long way.
    Here's a look back at the journey we've taken.
</p>
</div>

<div class="timeline">
<div class="timeline-content content">

{{ blog_oneyearsnug_timeline_heading(heading="March 2023")}}

{{ blog_oneyearsnug_timeline_event(
    title="Southern California Linux Expo 20x", 
    content="<img src='/blog/one-year-snug/scale-2023-booth.jpg' />
    <br>
    Dan, Daniel and Ben (not pictured) got roped into boothing at SCALE for the Nix booth. <br><br> 
    After meeting some enthusiastic users from around the region, they started talking about starting a Nix meetup in Southern California."
)}}

{{ blog_oneyearsnug_timeline_heading(heading="April 2023")}}

{{ blog_oneyearsnug_founder_chat() }}

{{ blog_oneyearsnug_timeline_heading(heading="Some time later...")}}

{% blog_oneyearsnug_timeline_special(class_name="members-milestone") %}
    <img src="/blog/one-year-snug/computer_message_app.png">
    <p>#socal-nug:matrix.org created</p>
{% end %}


{{ blog_oneyearsnug_timeline_heading(heading="May 2023")}}

{{ blog_oneyearsnug_timeline_event(
    title="The First SNUG", 
    content="
    <img src='/images/gallery/snug-001/group-photo.jpg'>

    We held the first SNUG in <a href='https://socal-nug.com/events/2023-05-30/'>23/b Hackerspace in Fullerton</a>"
)}}

{% blog_oneyearsnug_timeline_special(class_name="members-milestone") %}
<img src="/blog/one-year-snug/internet.jpg">

<p>socal-nug.com registered</p>
{% end %}

{{ blog_oneyearsnug_timeline_heading(heading="Months later...")}}

{% blog_oneyearsnug_timeline_special(class_name="members-milestone") %}
<img src="/blog/one-year-snug/snug-memories.jpg">
<p>A Year of SNUGs</p>
{% end %}

{{ blog_oneyearsnug_timeline_heading(heading="March 2024")}}

{{ blog_oneyearsnug_timeline_event(
    title="SCaLE 21x and NixCon NA 2024", 
    content="<img src='/blog/one-year-snug/nixcon-photo.jpg'>SCaLE 21x and NixCon NA 2024 was a blast! We met many 
    Nix users from around the area.    
    "
)}}

{{ blog_oneyearsnug_timeline_heading(heading="April 2024")}}

{% blog_oneyearsnug_timeline_special(class_name="members-milestone") %}
    <span class="count">40+</span>
    <span class="word">members in Matrix</span>
{% end %}

{{ blog_oneyearsnug_timeline_event(
    title="SNUG #5: Largest SNUG to date!", 
    content="
    <img src='/blog/one-year-snug/snug-5.jpg'>
    Despite the rain and cloudy weather, our group's sunny disposition shone through."
)}}

{{ blog_oneyearsnug_timeline_heading(heading="June 2024")}}

{{ blog_oneyearsnug_timeline_event(
    title="One Year of SNUG",
    content="
    <img src='/blog/one-year-snug/snug-logo.png'>
    As they say, time flies when you're having fun. When we first started the group, 
    we were expecting the same 4 people attending each time.

    <br>
    <br>
    
    But after one year, we've come quite a ways. Here's to another year of SNUG!"
)}}

{{ blog_oneyearsnug_timeline_heading(heading="Join us for the anniversary SNUG!")}}

{{ blog_oneyearsnug_june_2024_snug() }}
</div>
</div>