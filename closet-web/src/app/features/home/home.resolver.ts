import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { filter, take, switchMap, map } from 'rxjs/operators';
import { forkJoin, from } from 'rxjs';
import { UserService } from '../../core/services/user.service';
import { NewsService } from '../../core/services/news.service';
import { HomeDisplayItem, UserPublicProfile, TUTORIAL_GRID_ITEM } from '../../core/models/user.model';
import { NewsArticle } from '../../core/models/news.model';

export interface HomeResolvedData {
  displayItems: HomeDisplayItem[];
  myProfile: UserPublicProfile | null;
  stats: { posts: number; followers: number; following: number };
  featuredArticle: NewsArticle | null;
}

export const homeResolver: ResolveFn<HomeResolvedData> = () => {
  const auth = inject(Auth);
  const userService = inject(UserService);
  const newsService = inject(NewsService);

  const featuredArticle$ = newsService.fetchArticles().pipe(
    take(1),
    map(articles => articles.length
      ? articles.reduce((latest, a) =>
        new Date(a.publishedAt).getTime() > new Date(latest.publishedAt).getTime() ? a : latest
      )
      : null
    )
  );

  return authState(auth).pipe(
    filter(user => !!user?.uid),
    take(1),
    switchMap(user =>
      forkJoin({
        displayItems: from(userService.getDisplayItems(user!.uid)).pipe(
          map(items => {
            const hasTutorial = items.some(i => i.id === '__tutorial__');
            return hasTutorial ? items : [TUTORIAL_GRID_ITEM, ...items];
          })
        ),
        myProfile: from(userService.getPublicProfile(user!.uid)),
        stats: forkJoin({
          posts: from(userService.getPostCount(user!.uid)),
          followers: userService.getFollowerCount$(user!.uid).pipe(take(1)),
          following: userService.getFollowingCount$(user!.uid).pipe(take(1)),
        }),
        featuredArticle: featuredArticle$,
      })
    )
  );
};
