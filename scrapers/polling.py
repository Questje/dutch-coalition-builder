import requests
from bs4 import BeautifulSoup
import re
from typing import List, Dict, Tuple
from models.coalition import Party
from datetime import datetime

class PollingScraper:
    """Scrapes polling data from peilingennederland.nl"""
    
    def __init__(self, url: str = "https://www.peilingennederland.nl/alle-peilingen.html"):
        self.url = url
        self.polls_data = {}  # Store all polls
        
    def fetch_page(self) -> str:
        """Fetch the webpage content."""
        try:
            response = requests.get(self.url)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            raise Exception(f"Failed to fetch webpage: {e}")
    
    def parse_all_polls(self, html_content: str) -> Dict[str, List[Party]]:
        """Parse all polls from HTML content."""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        divs = soup.find_all('div', class_='paragraph')
        polls = {}
        
        for div in divs:
            if div.get('style') == 'text-align:left;':
                # Check if this div contains party data
                span = div.find('span', style='color:rgb(42, 42, 42)')
                if span and re.search(r'[A-Z]{2,}.*:\s*\d+', str(span)):
                    parties = self._extract_parties_from_span(span)
                    if parties:
                        # Look for the nearest preceding h2 with class wsite-content-title
                        poll_title = self._find_poll_title(div)
                        if poll_title and poll_title not in polls:
                            polls[poll_title] = parties
                        else:
                            # Fallback naming if no title found
                            poll_title = f"Poll #{len(polls) + 1}"
                            polls[poll_title] = parties
        
        return polls
    
    def _find_poll_title(self, div) -> str:
        """Find the poll title from the nearest preceding h2 element."""
        # Search backwards through all previous siblings and their descendants
        current = div
        
        while current:
            # Check previous siblings
            for sibling in current.find_previous_siblings():
                # Look for h2 with class wsite-content-title
                h2 = None
                if sibling.name == 'h2' and 'wsite-content-title' in sibling.get('class', []):
                    h2 = sibling
                else:
                    # Check if h2 is a child of this sibling
                    h2 = sibling.find('h2', class_='wsite-content-title')
                
                if h2:
                    # Extract text from the h2
                    title_text = h2.get_text(strip=True)
                    # Clean up the title
                    title_text = re.sub(r'\s+', ' ', title_text)
                    return title_text
            
            # Move up to parent and continue searching
            current = current.parent
            # Stop if we've gone too far up (reached body or html)
            if current and current.name in ['body', 'html', '[document]']:
                break
        
        return None
    
    def _extract_parties_from_span(self, span) -> List[Party]:
        """Extract party names and seats from span element."""
        parties = []
        
        html_content = str(span)
        html_content = html_content.replace('<span style="color:rgb(42, 42, 42)">', '')
        html_content = html_content.replace('</span>', '')
        
        lines = re.split(r'<br\s*/?>', html_content)
        
        for line in lines:
            line = line.strip()
            line = line.replace('\u200b', '')
            line = line.replace('&nbsp;', ' ')
            line = line.replace('&#8203;', '')
            
            # More flexible pattern matching
            match = re.match(r'([A-Za-z0-9\-/]+)[\s:]+(\d+)', line)
            if match:
                party_name = match.group(1).strip()
                # Handle GL-PvdA variations
                if 'GL' in party_name and 'PvdA' in party_name:
                    party_name = 'GL-PvdA'
                seats = int(match.group(2))
                parties.append(Party(name=party_name, seats=seats))
        
        parties.sort(key=lambda p: p.seats, reverse=True)
        
        return parties
    
    def get_all_polls(self) -> Dict[str, List[Party]]:
        """Get all polls from the page."""
        html_content = self.fetch_page()
        self.polls_data = self.parse_all_polls(html_content)
        return self.polls_data
    
    def get_latest_polls(self) -> List[Party]:
        """Get the first/latest poll (for backward compatibility)."""
        if not self.polls_data:
            self.get_all_polls()
        
        if self.polls_data:
            # Return the first poll
            first_poll_key = list(self.polls_data.keys())[0]
            return self.polls_data[first_poll_key]
        
        return []
    
    def get_average_polls(self) -> List[Party]:
        """
        Calculate average of all polls using largest remainder method.
        This ensures the total is exactly 150 seats.
        """
        if not self.polls_data:
            self.get_all_polls()
        
        if not self.polls_data:
            return []
        
        # Collect all unique party names and their seat counts
        party_seats = {}  # party_name -> list of seats
        
        for poll_name, parties in self.polls_data.items():
            for party in parties:
                if party.name not in party_seats:
                    party_seats[party.name] = []
                party_seats[party.name].append(party.seats)
        
        # Calculate exact averages (floats)
        party_averages = {}
        for party_name, seats_list in party_seats.items():
            party_averages[party_name] = sum(seats_list) / len(seats_list)
        
        # Apply largest remainder method (Hamilton method) to ensure exactly 150 seats
        # Step 1: Give each party the integer part of their average
        allocated_seats = {}
        remainders = {}
        total_allocated = 0
        
        for party_name, avg_seats in party_averages.items():
            integer_part = int(avg_seats)
            remainder = avg_seats - integer_part
            
            allocated_seats[party_name] = integer_part
            remainders[party_name] = remainder
            total_allocated += integer_part
        
        # Step 2: Distribute remaining seats based on largest remainders
        remaining_seats = 150 - total_allocated
        
        # Sort parties by remainder (descending)
        sorted_by_remainder = sorted(remainders.items(), key=lambda x: x[1], reverse=True)
        
        # Distribute remaining seats
        for i in range(remaining_seats):
            if i < len(sorted_by_remainder):
                party_name = sorted_by_remainder[i][0]
                allocated_seats[party_name] += 1
        
        # Create Party objects with allocated seats
        average_parties = []
        for party_name, seats in allocated_seats.items():
            if seats > 0:  # Only include parties with at least 1 seat
                average_parties.append(Party(name=party_name, seats=seats))
        
        # Sort by seats (largest first)
        average_parties.sort(key=lambda p: p.seats, reverse=True)
        
        # Verify total is exactly 150
        total_seats = sum(p.seats for p in average_parties)
        if total_seats != 150:
            # This should never happen, but as a safety net:
            print(f"WARNING: Total seats = {total_seats}, adjusting to 150")
            diff = 150 - total_seats
            if diff > 0:
                # Add seats to largest party
                average_parties[0].seats += diff
            else:
                # Remove seats from largest party
                average_parties[0].seats += diff  # diff is negative
        
        return average_parties