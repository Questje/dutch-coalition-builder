import requests
from bs4 import BeautifulSoup
import re
from typing import List
from models.coalition import Party

class PollingScraper:
    """Scrapes polling data from peilingennederland.nl"""
    
    def __init__(self, url: str = "https://www.peilingennederland.nl/alle-peilingen.html"):
        self.url = url
        
    def fetch_page(self) -> str:
        """Fetch the webpage content."""
        try:
            response = requests.get(self.url)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            raise Exception(f"Failed to fetch webpage: {e}")
    
    def parse_parties(self, html_content: str) -> List[Party]:
        """Parse party data from HTML content."""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        divs = soup.find_all('div', class_='paragraph')
        
        for div in divs:
            if div.get('style') == 'text-align:left;':
                span = div.find('span', style='color:rgb(42, 42, 42)')
                if span and 'PVV' in str(span):
                    return self._extract_parties_from_span(span)
        
        raise Exception("Could not find party data in the webpage")
    
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
            
            match = re.match(r'([A-Za-z0-9\-]+):\s*(\d+)', line)
            if match:
                party_name = match.group(1)
                seats = int(match.group(2))
                parties.append(Party(name=party_name, seats=seats))
        
        parties.sort(key=lambda p: p.seats, reverse=True)
        
        return parties
    
    def get_latest_polls(self) -> List[Party]:
        """Main method to get the latest polling data."""
        html_content = self.fetch_page()
        return self.parse_parties(html_content)