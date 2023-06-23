# fedigraph

Access it here: https://fedigraph.com

This displays a graph of the fediverse (or at least, Mastodon instances (for
now)). Originally my intent was to show _all_ connections between instances --
both positive (peers) and negative (moderations, either [limiting][] or
[suspending][]). However, that graph is too dense to be useful. Most instances
will federate with most other instances, and so the graph is just a big blob. So
instead, this shows only negative connections. Perhaps most interestingly, it
also shows the _reason_ for the negative connection, if available.

## Limitations

1. The initial list of Mastodon instances is from
   [instances.social](instances.social). This is probably incomplete.
2. Most instances do not publicly list their moderations. At time of writing, of
   the roughly 17000 instances on the list, only around 1000 have public
   moderation lists.[^caveat]
3. To reduce the noise, this only shows instances which have at least one edge
   (i.e. either they moderate someone, or someone moderates them).

Still, I think this can be useful to get a sense of the overall shape of the
(Mastodon) fediverse.

## Graph

This is currently using [Cosmograph][]. I started using this while I was still
trying to see peer connections as well, but even cosmograph struggles with that
many connections. Since I've pared down the graph considerably, I may switch to
something else that might give a better visualization.


[instances.social]: https://instances.social
[limiting]: https://docs.joinmastodon.org/admin/moderation/#limit-server
[suspending]: https://docs.joinmastodon.org/admin/moderation/#suspend-server
[Cosmograph]: https://cosmograph.app/

[^caveat]: Strictly speaking, this filters out moderations of servers that
    aren't in the original list, and also only display nodes that has an
    edge to another node. So it's possible there are more than 1000 instances
    with public moderation lists, but they're not connected to any of the
    instances in the original list.
