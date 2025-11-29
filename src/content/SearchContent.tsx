import SearchBar from "~/src/SearchBar";
import catPNG from '~/assets/cat.png';

export default function SearchContent() {
  return <div class="h-screen py-2 pr-2">
    <div class="flex items-center flex-col relative isolate overflow-auto py-2  bg-neu-900 h-full rounded-2xl border border-neu-800 ">

      <div class="mt-[40vh]  space-y-8">
        <div class="flex items-center space-x-2 justify-center relative">
          <img src={catPNG} class="h-24 absolute left-0 bottom-0 -translate-x-full" />
          <div class="flex-1 font-nunito font-medium text-white text-7xl leading-none px-4">
            Unblink
          </div>
        </div>
        <div class="relative z-40 ">
          <SearchBar variant="lg" />
        </div>
      </div>
    </div>
  </div>
}